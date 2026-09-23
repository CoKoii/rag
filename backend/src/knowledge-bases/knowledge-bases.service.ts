import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Repository } from 'typeorm';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { DocumentParseResponseDto } from './dto/document-parse-response.dto.js';
import { DocumentResponseDto } from './dto/document-response.dto.js';
import { ChunkResponseDto } from './dto/chunk-response.dto.js';
import { ChunkingService } from './chunking/chunking.service.js';
import { ChunkEntity } from './entities/chunk.entity.js';
import { DocumentEntity, DocumentStatus } from './entities/document.entity.js';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity.js';
import { LocalStorageService } from './local-storage.service.js';
import { DocumentParseService } from './parse/parse.service.js';

@Injectable()
export class KnowledgeBasesService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBaseEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly storage: LocalStorageService,
    private readonly parser: DocumentParseService,
    @InjectRepository(ChunkEntity)
    private readonly chunkRepository: Repository<ChunkEntity>,
    private readonly chunking: ChunkingService,
  ) {}

  async create(dto: CreateKnowledgeBaseDto) {
    try {
      return await this.knowledgeBaseRepository.save(
        this.knowledgeBaseRepository.create({
          id: randomUUID(),
          name: dto.name.trim(),
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('知识库名称已存在');
      }
      throw error;
    }
  }

  findAll() {
    return this.knowledgeBaseRepository.find();
  }

  async findDocuments(knowledgeBaseId: string): Promise<DocumentResponseDto[]> {
    await this.getKnowledgeBase(knowledgeBaseId);
    const documents = await this.documentRepository.find({
      where: { knowledgeBaseId },
      relations: { chunks: true },
    });
    return documents.map((document) => this.toDocumentResponse(document));
  }

  async findChunks(knowledgeBaseId: string, documentId: string): Promise<ChunkResponseDto[]> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    const chunks = await this.chunkRepository.find({
      where: { documentId },
      order: { index: 'ASC' },
    });
    return chunks.map((chunk) => this.toChunkResponse(chunk, document.originalName));
  }

  async createChunks(knowledgeBaseId: string, documentId: string): Promise<ChunkResponseDto[]> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    if (!document.parsedData) throw new BadRequestException('请先解析文档');

    const drafts = this.chunking.create(document.parsedData);
    await this.chunkRepository.delete({ documentId });
    const chunks = drafts.map((draft, index) => this.chunkRepository.create({
      id: randomUUID(),
      documentId,
      index,
      content: draft.content,
      sectionPaths: draft.sectionPaths,
      tokenCount: draft.tokenCount,
    }));
    return (await this.chunkRepository.save(chunks)).map((chunk) => this.toChunkResponse(chunk, document.originalName));
  }

  async createDocument(knowledgeBaseId: string, file: Express.Multer.File): Promise<DocumentResponseDto> {
    await this.getKnowledgeBase(knowledgeBaseId);
    const originalName = normalizeFileName(file.originalname);
    const document = this.documentRepository.create({
      id: randomUUID(),
      knowledgeBaseId,
      originalName,
      storagePath: '',
      parsedData: null,
    });
    const savedDocument = await this.documentRepository.save(document);

    try {
      const savedFile = await this.storage.save(
        knowledgeBaseId,
        savedDocument.id,
        originalName,
        file.buffer,
      );
      savedDocument.storagePath = savedFile.storagePath;
      return this.toDocumentResponse(await this.documentRepository.save(savedDocument));
    } catch (error) {
      await this.documentRepository.delete(savedDocument.id);
      throw error;
    }
  }

  async getDocumentParse(knowledgeBaseId: string, documentId: string): Promise<DocumentParseResponseDto> {
    return this.toParseResponse(await this.getDocument(knowledgeBaseId, documentId));
  }

  async parseDocument(knowledgeBaseId: string, documentId: string): Promise<DocumentParseResponseDto> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    if (!this.parser.canParse(document.originalName)) {
      throw new BadRequestException('当前文件格式暂不支持解析');
    }

    document.parsedData = null;
    await this.chunkRepository.delete({ documentId });
    document.status = DocumentStatus.PROCESSING;
    await this.documentRepository.save(document);

    try {
      document.parsedData = await this.parser.parse(document);
      document.status = DocumentStatus.READY;
    } catch (error) {
      document.status = DocumentStatus.FAILED;
      await this.documentRepository.save(document);
      throw error;
    }

    await this.documentRepository.save(document);
    return this.toParseResponse(document);
  }

  async removeDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, knowledgeBaseId },
    });
    if (!document) throw new NotFoundException('文件不存在');

    await this.storage.remove(document.storagePath);
    await this.documentRepository.remove(document);
  }

  async getDocumentFile(knowledgeBaseId: string, documentId: string) {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    return {
      name: document.originalName,
      contentType: contentTypeOf(document.originalName),
      buffer: await this.storage.read(document.storagePath),
    };
  }

  private async getKnowledgeBase(id: string) {
    const knowledgeBase = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!knowledgeBase) throw new NotFoundException('知识库不存在');
    return knowledgeBase;
  }

  private async getDocument(knowledgeBaseId: string, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, knowledgeBaseId },
    });
    if (!document) throw new NotFoundException('文件不存在');
    return document;
  }

  private toDocumentResponse(document: DocumentEntity): DocumentResponseDto {
    return {
      id: document.id,
      name: document.originalName,
      status: document.status,
      parsed: document.parsedData !== null,
      chunkCount: document.chunks?.length ?? 0,
    };
  }

  private toParseResponse(document: DocumentEntity): DocumentParseResponseDto {
    return {
      id: document.id,
      name: document.originalName,
      status: document.status,
      parsedData: document.parsedData,
    };
  }

  private toChunkResponse(chunk: ChunkEntity, documentName: string): ChunkResponseDto {
    return {
      id: chunk.id,
      documentId: chunk.documentId,
      documentName,
      index: chunk.index,
      content: chunk.content,
      sectionPaths: chunk.sectionPaths,
      tokenCount: chunk.tokenCount,
    };
  }
}

const normalizeFileName = (name: string): string => {
  for (let index = 0; index < name.length; index += 1) {
    if ((name.codePointAt(index) ?? 0) > 0xff) return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
};

const contentTypeOf = (name: string): string => {
  switch (extname(name).toLowerCase()) {
    case '.md':
    case '.markdown':
      return 'text/markdown; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
};
