import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChunkEntity } from '../entities/chunk.entity.js';
import { DocumentEntity } from '../entities/document.entity.js';
import { buildKeywordTerms, buildTsQuery } from './keyword-terms.js';

interface KeywordMatch {
  chunkId: string;
  score: number;
}

@Injectable()
export class KeywordSearchService implements OnModuleInit {
  constructor(
    @InjectRepository(ChunkEntity)
    private readonly chunks: Repository<ChunkEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.chunks.query(`
      CREATE INDEX IF NOT EXISTS document_chunks_keyword_terms_gin_idx
      ON document_chunks USING GIN (to_tsvector('simple', keyword_terms))
    `);
  }

  async search(
    knowledgeBaseId: string,
    query: string,
    limit: number,
  ): Promise<KeywordMatch[]> {
    const tsQuery = buildTsQuery(query);
    if (!tsQuery) return [];

    await this.backfillMissingTerms(knowledgeBaseId);
    return this.chunks.query(
      `
        SELECT chunk.id AS "chunkId",
          ts_rank_cd(
            to_tsvector('simple', chunk.keyword_terms),
            to_tsquery('simple', $2)
          ) AS score
        FROM document_chunks chunk
        INNER JOIN documents document ON document.id = chunk.document_id
        WHERE document.knowledge_base_id = $1
          AND to_tsvector('simple', chunk.keyword_terms)
            @@ to_tsquery('simple', $2)
        ORDER BY score DESC, chunk.chunk_index ASC
        LIMIT $3
      `,
      [knowledgeBaseId, tsQuery, limit],
    ) as Promise<KeywordMatch[]>;
  }

  private async backfillMissingTerms(knowledgeBaseId: string): Promise<void> {
    const missing = await this.chunks
      .createQueryBuilder('chunk')
      .innerJoin(DocumentEntity, 'document', 'document.id = chunk.document_id')
      .where('document.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId,
      })
      .andWhere("chunk.keywordTerms = ''")
      .getMany();

    for (let offset = 0; offset < missing.length; offset += 500) {
      const batch = missing.slice(offset, offset + 500);
      for (const chunk of batch) {
        chunk.keywordTerms = buildKeywordTerms(chunk.content);
      }
      await this.chunks.save(batch);
    }
  }
}
