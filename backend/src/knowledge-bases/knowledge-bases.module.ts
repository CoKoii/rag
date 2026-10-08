import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBasesController } from './knowledge-bases.controller.js';
import { DocumentEntity } from './entities/document.entity.js';
import { ChunkEntity } from './entities/chunk.entity.js';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity.js';
import { KnowledgeBasesService } from './knowledge-bases.service.js';
import { LocalStorageService } from './local-storage.service.js';
import { DocumentParseService } from './parse/parse.service.js';
import { ChunkingService } from './chunking/chunking.service.js';
import { QdrantModule } from '../qdrant.module.js';
import { QwenEmbeddingService } from './embedding/qwen-embedding.service.js';
import { KeywordSearchService } from './retrieval/keyword-search.service.js';
import { QwenRerankService } from './retrieval/qwen-rerank.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      DocumentEntity,
      ChunkEntity,
    ]),
    QdrantModule,
  ],
  controllers: [KnowledgeBasesController],
  providers: [
    KnowledgeBasesService,
    LocalStorageService,
    DocumentParseService,
    ChunkingService,
    QwenEmbeddingService,
    KeywordSearchService,
    QwenRerankService,
  ],
})
export class KnowledgeBasesModule {}
