import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { DocumentResponseDto } from './dto/document-response.dto.js';
import { DocumentEntity } from './entities/document.entity.js';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity.js';
import { LocalStorageService } from './local-storage.service.js';

@Injectable()
export class KnowledgeBasesService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBaseEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly storage: LocalStorageService,
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
    });
    return documents.map((document) => this.toDocumentResponse(document));
  }

  async createDocument(knowledgeBaseId: string, file: Express.Multer.File): Promise<DocumentResponseDto> {
    await this.getKnowledgeBase(knowledgeBaseId);
    const document = this.documentRepository.create({
      id: randomUUID(),
      knowledgeBaseId,
      originalName: file.originalname,
      storagePath: '',
    });
    const savedDocument = await this.documentRepository.save(document);

    try {
      const savedFile = await this.storage.save(
        knowledgeBaseId,
        savedDocument.id,
        file.originalname,
        file.buffer,
      );
      savedDocument.storagePath = savedFile.storagePath;
      return this.toDocumentResponse(await this.documentRepository.save(savedDocument));
    } catch (error) {
      await this.documentRepository.delete(savedDocument.id);
      throw error;
    }
  }

  async removeDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, knowledgeBaseId },
    });
    if (!document) throw new NotFoundException('文件不存在');

    await this.storage.remove(document.storagePath);
    await this.documentRepository.remove(document);
  }

  private async getKnowledgeBase(id: string) {
    const knowledgeBase = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!knowledgeBase) throw new NotFoundException('知识库不存在');
    return knowledgeBase;
  }

  private toDocumentResponse(document: DocumentEntity): DocumentResponseDto {
    return {
      id: document.id,
      name: document.originalName,
      status: document.status,
    };
  }
}
