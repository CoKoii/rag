import {
  BadGatewayException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(QwenEmbeddingService.name);

  async embedTextImage(
    text: string,
    source: string,
  ): Promise<{ vector: number[]; content: string }> {
    try {
      const image = await this.imageDataUri(source);
      return {
        vector: await this.embed(text ? { text, image } : { image }),
        content: text,
      };
    } catch (error) {
      const imageDescription = source.startsWith('data:image/')
        ? '内嵌图片数据'
        : source;
      const fallbackText = [text, `图片引用：${imageDescription}`]
        .filter(Boolean)
        .join('\n');
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `多模态 embedding 失败，改用文本：${source.startsWith('data:image/') ? 'data URI' : source}；${reason}`,
      );
      return {
        vector: await this.embed({ text: fallbackText }),
        content: fallbackText,
      };
    }
  }

  async embedText(text: string): Promise<number[]> {
    return this.embed({ text });
  }

  private async imageDataUri(source: string): Promise<string> {
    if (source.startsWith('data:image/')) return source;
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadGatewayException(
        `无法解析 Markdown 图片地址：${source}。请使用绝对 HTTP(S) 地址或 data URI`,
      );
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadGatewayException('Markdown 图片仅支持 HTTP(S) 或 data URI');
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new BadGatewayException(
        `下载 Markdown 图片失败：${response.status}`,
      );
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0];
    if (!mimeType?.startsWith('image/')) {
      throw new BadGatewayException(
        `Markdown 图片地址返回了非图片内容：${source}`,
      );
    }
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > 10 * 1024 * 1024) {
      throw new BadGatewayException(`Markdown 图片超过 10 MB：${source}`);
    }
    return `data:${mimeType};base64,${image.toString('base64')}`;
  }

  private async embed(content: {
    text?: string;
    image?: string;
  }): Promise<number[]> {
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
