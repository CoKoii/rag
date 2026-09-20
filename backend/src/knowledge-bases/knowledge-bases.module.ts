import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBasesController } from './knowledge-bases.controller.js';
import { DocumentEntity } from './entities/document.entity.js';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity.js';
import { KnowledgeBasesService } from './knowledge-bases.service.js';
import { LocalStorageService } from './local-storage.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeBaseEntity, DocumentEntity])],
  controllers: [KnowledgeBasesController],
  providers: [KnowledgeBasesService, LocalStorageService],
})
export class KnowledgeBasesModule {}
