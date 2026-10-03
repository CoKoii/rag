import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DocumentEntity } from './document.entity.js';

/** Markdown 切片表：保存正文及多模态 embedding 所需的图片引用。 */
@Entity({ name: 'document_chunks', comment: '文档切片表' })
@Index('document_chunks_document_id_idx', ['documentId'])
export class ChunkEntity {
  /** 切片唯一标识。 */
  @PrimaryColumn({ type: 'text', comment: '切片唯一标识' })
  id!: string;

  /** 切片所属文档。 */
  @ManyToOne(() => DocumentEntity, (document) => document.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: DocumentEntity;

  /** 切片所属文档唯一标识。 */
  @Column({ name: 'document_id', type: 'text', comment: '所属文档唯一标识' })
  documentId!: string;

  /** 切片在文档中的顺序，从 0 开始。 */
  @Column({
    name: 'chunk_index',
    type: 'integer',
    comment: '切片顺序，从 0 开始',
  })
  index!: number;

  /** 切片正文。 */
  @Column({ type: 'text', comment: '切片正文' })
  content!: string;

  /** 切片关联的 Markdown 图片地址。 */
  @Column({
    name: 'image_sources',
    type: 'jsonb',
    default: [],
    comment: '切片关联图片地址',
  })
  imageSources!: string[];
}
