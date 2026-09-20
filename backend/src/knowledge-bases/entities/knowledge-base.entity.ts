import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { DocumentEntity } from './document.entity.js';

/** 知识库表：一个知识库可以包含多个文档。 */
@Entity({ name: 'knowledge_bases', comment: '知识库表' })
export class KnowledgeBaseEntity {
  /** 知识库唯一标识。 */
  @PrimaryColumn({ type: 'text', comment: '知识库唯一标识' })
  id!: string;

  /** 知识库名称。 */
  @Column({ type: 'text', unique: true, comment: '知识库名称' })
  name!: string;

  /** 知识库包含的文档。 */
  @OneToMany(() => DocumentEntity, (document) => document.knowledgeBase)
  documents!: DocumentEntity[];
}
