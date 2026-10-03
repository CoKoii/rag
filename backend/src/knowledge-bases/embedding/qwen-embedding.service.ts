import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

interface EmbeddingResponse {
  output?: {
    embeddings?: Array<{ embedding?: number[] }>;
  };
  code?: string;
  message?: string;
}

@Injectable()
export class QwenEmbeddingService {
  async embedImage(buffer: Buffer, mimeType: string): Promise<number[]> {
    return this.embed({
      image: `data:${mimeType};base64,${buffer.toString('base64')}`,
    });
  }

  async embedText(text: string): Promise<number[]> {
    return this.embed({ text });
  }

  private async embed(
    content: { image: string } | { text: string },
  ): Promise<number[]> {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
      throw new ServiceUnavailableException('请配置 DASHSCOPE_API_KEY');

    const response = await fetch(
      process.env.DASHSCOPE_EMBEDDING_URL ??
        'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.QWEN_EMBEDDING_MODEL ?? 'qwen3-vl-embedding',
          input: { contents: [content] },
        }),
      },
    );

    const body = (await response.json()) as EmbeddingResponse;
    const embedding = body.output?.embeddings?.[0]?.embedding;
    if (!response.ok || !embedding?.length) {
      throw new BadGatewayException(
        `Qwen embedding 失败：${body.message ?? response.statusText}`,
      );
    }
    return embedding;
  }
}
