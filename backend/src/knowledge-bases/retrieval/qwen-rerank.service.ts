import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

interface RerankResponse {
  output?: {
    results?: Array<{ index: number; relevance_score: number }>;
  };
  message?: string;
}

export interface RerankedDocument {
  index: number;
  score: number;
}

@Injectable()
export class QwenRerankService {
  async rerank(
    query: string,
    documents: string[],
  ): Promise<RerankedDocument[]> {
    if (!documents.length) return [];
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('请配置 DASHSCOPE_API_KEY');
    }

    const response = await fetch(
      process.env.DASHSCOPE_RERANK_URL ??
        'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.QWEN_RERANK_MODEL ?? 'qwen3.7-text-rerank',
          input: { query, documents },
          parameters: {
            top_n: documents.length,
            instruct:
              'Given a search query, retrieve relevant passages that answer the query.',
          },
        }),
      },
    );

    const body = (await response.json()) as RerankResponse;
    const results = body.output?.results;
    if (!response.ok || !results) {
      throw new BadGatewayException(
        `Qwen rerank 失败：${body.message ?? response.statusText}`,
      );
    }
    return results.map(({ index, relevance_score: score }) => ({
      index,
      score,
    }));
  }
}
