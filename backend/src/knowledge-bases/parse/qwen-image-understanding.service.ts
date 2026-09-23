import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { HumanMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class QwenImageUnderstandingService {
  private chain?: Runnable<BaseLanguageModelInput, string>;

  async describe(image: Buffer, mimeType: string): Promise<string> {
    return this.describeImage(
      `data:${mimeType};base64,${image.toString('base64')}`,
    );
  }

  async describeUrl(imageUrl: string): Promise<string> {
    return this.describeImage(imageUrl);
  }

  private describeImage(imageUrl: string): Promise<string> {
    return this.getChain()
      .invoke([
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: '请用中文描述这张图片中与知识检索有关的信息。准确抄录重要文字，并说明图表、截图或示意图表达的内容；看不清的内容不要猜测。只输出可供文档检索的简洁正文。',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        }),
      ])
      .then((description) => {
        const text = description.trim();
        if (!text) throw new BadGatewayException('Qwen 未返回图片描述');
        return text;
      })
      .catch((error: unknown) => {
        if (error instanceof BadGatewayException) throw error;
        const detail = error instanceof Error ? error.message : '未知错误';
        throw new BadGatewayException(`Qwen 图片解析失败：${detail}`);
      });
  }

  private getChain(): Runnable<BaseLanguageModelInput, string> {
    if (this.chain) return this.chain;

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey)
      throw new ServiceUnavailableException(
        '请配置 DASHSCOPE_API_KEY 后再解析图片',
      );

    const baseUrl = (
      process.env.DASHSCOPE_BASE_URL ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ).replace(/\/+$/u, '');
    const model = process.env.QWEN_OMNI_MODEL ?? 'qwen3.8-omni-flash';
    const chat = new ChatOpenAI({
      model,
      apiKey,
      configuration: { baseURL: baseUrl },
      timeout: 60_000,
      maxRetries: 1,
    });
    this.chain = chat.pipe(new StringOutputParser());
    return this.chain;
  }
}
