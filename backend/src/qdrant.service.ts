import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

const embeddingVectorSize = 2560;

export interface VectorPoint {
  id: string;
  vector: number[];
  knowledgeBaseId: string;
  documentId: string;
  chunkId: string;
  content: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: {
    knowledgeBaseId: string;
    documentId: string;
    chunkId: string;
    content: string;
  };
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  readonly collection = process.env.QDRANT_COLLECTION ?? 'rag_chunks';
  readonly client = new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    checkCompatibility: false,
  });

  async onModuleInit(): Promise<void> {
    const { collections } = await this.client.getCollections();
    this.logger.log(
      `connected to Qdrant (${collections.map(({ name }) => name).join(', ') || 'no collections'})`,
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (await this.collectionExists()) {
      await this.deleteDocumentPoints(documentId);
    }
  }

  async replaceDocument(
    documentId: string,
    points: VectorPoint[],
  ): Promise<void> {
    if (points.some(({ vector }) => vector.length !== embeddingVectorSize)) {
      throw new Error(
        `Expected ${embeddingVectorSize}-dimension qwen3-vl-embedding vectors`,
      );
    }
    if (!(await this.collectionExists())) {
      if (!points.length) return;
      await this.client.createCollection(this.collection, {
        vectors: { size: embeddingVectorSize, distance: 'Cosine' },
      });
    } else {
      await this.deleteDocumentPoints(documentId);
    }
    if (!points.length) return;

    await this.client.upsert(this.collection, {
      wait: true,
      points: points.map(
        ({ id, vector, knowledgeBaseId, documentId, chunkId, content }) => ({
          id,
          vector,
          payload: { knowledgeBaseId, documentId, chunkId, content },
        }),
      ),
    });
  }

  async search(
    knowledgeBaseId: string,
    vector: number[],
    limit: number,
  ): Promise<VectorSearchResult[]> {
    if (!(await this.collectionExists())) return [];
    const response = await this.client.query(this.collection, {
      query: vector,
      limit,
      with_payload: true,
      filter: {
        must: [{ key: 'knowledgeBaseId', match: { value: knowledgeBaseId } }],
      },
    });
    return response.points.map((result) => ({
      id: String(result.id),
      score: result.score,
      payload: result.payload as VectorSearchResult['payload'],
    }));
  }

  private async deleteDocumentPoints(documentId: string): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });
  }

  private async collectionExists(): Promise<boolean> {
    const { collections } = await this.client.getCollections();
    return collections.some(({ name }) => name === this.collection);
  }
}
