import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import type { ParsedDocument } from '../parse/shared/parsed-tree.js';
import { ChunkEntity } from './chunk.entity.js';
import { KnowledgeBaseEntity } from './knowledge-base.entity.js';

/** 文档处理状态。后续解析、切片和向量化会继续扩展这些状态。 */
export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

/** 文档表：保存文件路径和 RAG 处理状态。 */
@Entity({ name: 'documents', comment: '文档表' })
@Index('documents_knowledge_base_id_idx', ['knowledgeBaseId'])
export class DocumentEntity {
  /** 文档唯一标识。 */
  @PrimaryColumn({ type: 'text', comment: '文档唯一标识' })
  id!: string;

  /** 文档所属知识库。 */
  @ManyToOne(
    () => KnowledgeBaseEntity,
    (knowledgeBase) => knowledgeBase.documents,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'knowledge_base_id' })
  knowledgeBase!: KnowledgeBaseEntity;

  /** 文档所属知识库唯一标识。 */
  @Column({
    name: 'knowledge_base_id',
    type: 'text',
    comment: '所属知识库唯一标识',
  })
  knowledgeBaseId!: string;

  /** 用户上传时的原始文件名。 */
  @Column({ name: 'original_name', type: 'text', comment: '原始文件名' })
  originalName!: string;

  /** 文件相对于本地上传目录的路径。 */
  @Column({ name: 'storage_path', type: 'text', comment: '本地文件相对路径' })
  storagePath!: string;

  /** 文档解析后的统一 JSON 树。 */
  @Column({
    name: 'parsed_data',
    type: 'jsonb',
    nullable: true,
    comment: '文档解析后的统一 JSON 树',
  })
  parsedData!: ParsedDocument | null;

  /** 当前处理状态。 */
  @Column({
    type: 'text',
    default: DocumentStatus.UPLOADED,
    comment: '文档处理状态',
  })
  status!: DocumentStatus;

  /** 文档包含的切片。 */
  @OneToMany(() => ChunkEntity, (chunk) => chunk.document)
  chunks!: ChunkEntity[];
}
