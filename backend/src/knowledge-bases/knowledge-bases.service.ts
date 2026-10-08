import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { DocumentParseResponseDto } from './dto/document-parse-response.dto.js';
import { DocumentResponseDto } from './dto/document-response.dto.js';
import { ChunkResponseDto } from './dto/chunk-response.dto.js';
import { RetrieveRequestDto } from './dto/retrieve-request.dto.js';
import { RetrievalResultDto } from './dto/retrieval-result.dto.js';
import { ChunkingService } from './chunking/chunking.service.js';
import { QwenEmbeddingService } from './embedding/qwen-embedding.service.js';
import { QdrantService } from '../qdrant.service.js';
import { ChunkEntity } from './entities/chunk.entity.js';
import { DocumentEntity, DocumentStatus } from './entities/document.entity.js';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity.js';
import { LocalStorageService } from './local-storage.service.js';
import { DocumentParseService } from './parse/parse.service.js';
import { buildKeywordTerms } from './retrieval/keyword-terms.js';
import { KeywordSearchService } from './retrieval/keyword-search.service.js';
import { QwenRerankService } from './retrieval/qwen-rerank.service.js';
import { reciprocalRankFusion } from './retrieval/rank-fusion.js';

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
    private readonly embedding: QwenEmbeddingService,
    private readonly qdrant: QdrantService,
    private readonly keywordSearch: KeywordSearchService,
    private readonly reranker: QwenRerankService,
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
    const [documents, counts] = await Promise.all([
      this.documentRepository.find({ where: { knowledgeBaseId } }),
      this.chunkRepository
        .createQueryBuilder('chunk')
        .innerJoin('chunk.document', 'document')
        .select('chunk.documentId', 'documentId')
        .addSelect('COUNT(*)', 'count')
        .where('document.knowledgeBaseId = :knowledgeBaseId', {
          knowledgeBaseId,
        })
        .groupBy('chunk.documentId')
        .getRawMany<{ documentId: string; count: string }>(),
    ]);
    const countByDocument = new Map(
      counts.map(({ documentId, count }) => [documentId, Number(count)]),
    );
    return documents.map((document) => ({
      ...this.toDocumentResponse(document),
      chunkCount: countByDocument.get(document.id) ?? 0,
    }));
  }

  async findChunks(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<ChunkResponseDto[]> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    const chunks = await this.chunkRepository.find({
      where: { documentId },
      order: { index: 'ASC' },
    });
    return chunks.map((chunk) =>
      this.toChunkResponse(chunk, document.originalName),
    );
  }

  async createChunks(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<ChunkResponseDto[]> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    if (!document.parsedData) throw new BadRequestException('请先解析文档');

    const drafts = this.chunking.create(document.parsedData);
    const savedChunks = await this.chunkRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(ChunkEntity);
        await repository.delete({ documentId });
        const chunks = drafts.map((draft, index) =>
          repository.create({
            id: randomUUID(),
            documentId,
            index,
            content: draft.content,
            keywordTerms: buildKeywordTerms(draft.content),
          }),
        );
        return chunks.length ? repository.save(chunks) : [];
      },
    );
    await this.qdrant.deleteDocument(documentId);
    return savedChunks.map((chunk) =>
      this.toChunkResponse(chunk, document.originalName),
    );
  }

  async embedDocument(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<{ count: number }> {
    await this.getDocument(knowledgeBaseId, documentId);
    const chunks = await this.chunkRepository.find({
      where: { documentId },
      order: { index: 'ASC' },
    });
    if (!chunks.length) throw new BadRequestException('请先切片文档');

    const points = await Promise.all(
      chunks.map(async (chunk) => ({
        id: chunk.id,
        vector: await this.embedding.embedText(chunk.content),
        knowledgeBaseId,
        documentId,
        chunkId: chunk.id,
        content: chunk.content,
      })),
    );
    await this.qdrant.replaceDocument(documentId, points);
    return { count: points.length };
  }

  async retrieve(
    knowledgeBaseId: string,
    request: RetrieveRequestDto,
  ): Promise<RetrievalResultDto[]> {
    await this.getKnowledgeBase(knowledgeBaseId);
    const query = request.query.trim();
    if (!query) throw new BadRequestException('请输入检索问题');

    const topK = Math.min(Math.max(Math.trunc(request.topK ?? 5), 1), 20);
    const candidateLimit = Math.min(topK * 10, 100);
    const [vectorMatches, keywordMatches] = await Promise.all([
      this.embedding
        .embedText(query)
        .then((vector) =>
          this.qdrant.search(knowledgeBaseId, vector, candidateLimit),
        ),
      this.keywordSearch.search(knowledgeBaseId, query, candidateLimit),
    ]);
    const fused = reciprocalRankFusion(
      vectorMatches.map(({ payload }) => payload.chunkId),
      keywordMatches.map(({ chunkId }) => chunkId),
    ).slice(0, candidateLimit);
    if (!fused.length) return [];

    const chunks = await this.chunkRepository.findBy({
      id: In(fused.map(({ chunkId }) => chunkId)),
    });
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const candidates = fused.flatMap(({ chunkId }) => {
      const chunk = chunksById.get(chunkId);
      return chunk ? [{ chunkId, content: chunk.content, chunk }] : [];
    });
    if (!candidates.length) return [];

    const reranked = await this.reranker.rerank(
      query,
      candidates.map(({ content }) => content),
    );
    const documents = await this.documentRepository.findBy({
      id: In(candidates.map(({ chunk }) => chunk.documentId)),
    });
    const documentNames = new Map(
      documents.map(({ id, originalName }) => [id, originalName]),
    );

    return reranked.slice(0, topK).flatMap(({ index, score }) => {
      const candidate = candidates[index];
      if (!candidate) return [];
      return [
        {
          id: candidate.chunkId,
          score,
          documentId: candidate.chunk.documentId,
          documentName:
            documentNames.get(candidate.chunk.documentId) ?? '未知文档',
          chunkId: candidate.chunkId,
          index: candidate.chunk.index,
          content: candidate.content,
        },
      ];
    });
  }
  async createDocument(
    knowledgeBaseId: string,
    file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
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
      return this.toDocumentResponse(
        await this.documentRepository.save(savedDocument),
      );
    } catch (error) {
      await this.documentRepository.delete(savedDocument.id);
      throw error;
    }
  }

  async getDocumentParse(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<DocumentParseResponseDto> {
    return this.toParseResponse(
      await this.getDocument(knowledgeBaseId, documentId),
    );
  }

  async parseDocument(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<DocumentParseResponseDto> {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    if (!this.parser.canParse(document.originalName)) {
      throw new BadRequestException('当前文件格式暂不支持解析');
    }

    document.status = DocumentStatus.PROCESSING;
    await this.documentRepository.save(document);
    const previousParsedData = document.parsedData;

    try {
      const parsedData = await this.parser.parse(document.storagePath);
      await this.documentRepository.manager.transaction(async (manager) => {
        await manager.getRepository(ChunkEntity).delete({ documentId });
        document.parsedData = parsedData;
        document.status = DocumentStatus.READY;
        await manager.getRepository(DocumentEntity).save(document);
      });
    } catch (error) {
      document.parsedData = previousParsedData;
      document.status = DocumentStatus.FAILED;
      await this.documentRepository.save(document);
      throw error;
    }

    await this.qdrant.deleteDocument(documentId);
    return this.toParseResponse(document);
  }

  async removeDocument(
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, knowledgeBaseId },
    });
    if (!document) throw new NotFoundException('文件不存在');

    await this.qdrant.deleteDocument(documentId);
    await this.storage.remove(document.storagePath);
    await this.documentRepository.remove(document);
  }

  async getDocumentFile(knowledgeBaseId: string, documentId: string) {
    const document = await this.getDocument(knowledgeBaseId, documentId);
    return {
      name: document.originalName,
      contentType: 'text/markdown; charset=utf-8',
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

  private toChunkResponse(
    chunk: ChunkEntity,
    documentName: string,
  ): ChunkResponseDto {
    return {
      id: chunk.id,
      documentId: chunk.documentId,
      documentName,
      index: chunk.index,
      content: chunk.content,
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
