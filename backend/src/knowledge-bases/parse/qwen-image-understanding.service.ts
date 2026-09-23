import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class QwenImageUnderstandingService {
  async describe(image: Buffer, mimeType: string): Promise<string> {
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请用中文描述这张图片中与知识检索有关的信息。准确抄录重要文字，并说明图表、截图或示意图表达的内容；看不清的内容不要猜测。只输出可供文档检索的简洁正文。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image.toString('base64')}`,
                },
              },
            ],
          },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Qwen 图片解析失败（HTTP ${response.status}）`,
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | Array<{ text?: string }> };
      }>;
      error?: { message?: string };
    };
    const content = result.choices?.[0]?.message?.content;
    const description =
      typeof content === 'string'
        ? content.trim()
        : content
            ?.map((part) => part.text ?? '')
            .join('\n')
            .trim();
    if (!description) {
      throw new BadGatewayException(
        result.error?.message ?? 'Qwen 未返回图片描述',
      );
    }
    return description;
  }
}
