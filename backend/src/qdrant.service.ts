import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

const embeddingVectorSize = 2560;

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

  async replaceDocument(
    documentId: string,
    points: Array<{ id: string; vector: number[]; content: string }>,
  ): Promise<void> {
    if (!points.length) return;
    await this.ensureCollection(points[0].vector.length);
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });
    await this.client.upsert(this.collection, {
      wait: true,
      points: points.map(({ id, vector, content }) => ({
        id,
        vector,
        payload: { documentId, content },
      })),
    });
  }

  private async ensureCollection(size: number): Promise<void> {
    if (size !== embeddingVectorSize) {
      throw new Error(`Unexpected qwen3-vl-embedding dimension: ${size}`);
    }
    const collections = await this.client.getCollections();
    if (collections.collections.some(({ name }) => name === this.collection))
      return;
    await this.client.createCollection(this.collection, {
      vectors: { size, distance: 'Cosine' },
    });
  }
}
