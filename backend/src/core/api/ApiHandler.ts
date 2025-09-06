import { ApiConfiguration, ApiMessage, ClineMessage } from '@/types';
import { EventEmitter } from 'node:events';

export interface ApiResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost?: number;
  };
  reasoning?: string;
  grounding?: any;
}

export interface ApiStreamChunk {
  type: 'reasoning' | 'usage' | 'grounding' | 'text';
  content: any;
}

export class ApiHandler extends EventEmitter {
  private config: ApiConfiguration;
  private abortController?: AbortController;

  constructor(config: ApiConfiguration) {
    super();
    this.config = config;
  }

  async makeRequest(
    messages: ApiMessage[],
    onStream?: (chunk: ApiStreamChunk) => void,
    systemPrompt?: string
  ): Promise<ApiResponse> {
    this.abortController = new AbortController();
    
    // 添加调试日志
    console.log('ApiHandler makeRequest - config:', JSON.stringify(this.config, null, 2));
    
    try {
      // 根据不同的 API 提供商实现请求逻辑
      switch (this.config.provider) {
        case 'anthropic':
          return await this.makeAnthropicRequest(messages, onStream, systemPrompt);
        case 'openai':
          return await this.makeOpenAIRequest(messages, onStream, systemPrompt);
        case 'google':
          return await this.makeGoogleRequest(messages, onStream, systemPrompt);
        case 'siliconflow':
          return await this.makeSiliconFlowRequest(messages, onStream, systemPrompt);
        default:
          throw new Error(`Unsupported API provider: ${this.config.provider}`);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async makeAnthropicRequest(
    messages: ApiMessage[],
    onStream?: (chunk: ApiStreamChunk) => void,
    systemPrompt?: string
  ): Promise<ApiResponse> {
    // Anthropic API 实现
    // 这里需要根据实际的 Anthropic SDK 来实现
    throw new Error('Anthropic API implementation not yet available');
  }

  private async makeOpenAIRequest(
    messages: ApiMessage[],
    onStream?: (chunk: ApiStreamChunk) => void,
    systemPrompt?: string
  ): Promise<ApiResponse> {
    // OpenAI API 实现
    throw new Error('OpenAI API implementation not yet available');
  }

  private async makeGoogleRequest(
    messages: ApiMessage[],
    onStream?: (chunk: ApiStreamChunk) => void,
    systemPrompt?: string
  ): Promise<ApiResponse> {
    // Google API 实现
    throw new Error('Google API implementation not yet available');
  }

  private async makeSiliconFlowRequest(
    messages: ApiMessage[],
    onStream?: (chunk: ApiStreamChunk) => void,
    systemPrompt?: string
  ): Promise<ApiResponse> {
    const url = `${this.config.apiBaseUrl}/chat/completions`;
    
    // 构建消息数组，如果有systemPrompt则添加到开头
    const apiMessages = [];
    if (systemPrompt) {
      apiMessages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // 添加用户消息
    apiMessages.push(...messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : 
        msg.content.map((c: any) => c.type === 'text' ? c.text : c).join('')
    })));
    
    const requestBody = {
      model: this.config.apiModelId,
      messages: apiMessages,
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature || 0.7,
      stream: !!onStream
    };
    
    // 打印发送给模型的完整消息
    // console.log('\n=== 发送给AI模型的完整消息 ===');
    // console.log('API URL:', url);
    // console.log('模型:', requestBody.model);
    // console.log('温度:', requestBody.temperature);
    // console.log('最大令牌数:', requestBody.max_tokens);
    // console.log('流式传输:', requestBody.stream);
    // console.log('消息总数:', requestBody.messages.length);
    
    // requestBody.messages.forEach((msg, index) => {
    //   console.log(`\n--- 消息 ${index + 1} (${msg.role}) ---`);
    //   if (msg.role === 'system') {
    //     console.log('系统提示词长度:', msg.content.length, '字符');
    //     console.log('系统提示词内容:');
    //     console.log(msg.content);
    //   } else {
    //     console.log('内容长度:', msg.content.length, '字符');
    //     console.log('内容:');
    //     console.log(msg.content.substring(0, 2000) + (msg.content.length > 2000 ? '\n...[内容过长，已截断]' : ''));
    //   }
    // });
    
    // console.log('\n=== 消息发送完毕 ===\n');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: this.abortController?.signal || null
    });

    if (!response.ok) {
      throw new Error(`SiliconFlow API request failed: ${response.status} ${response.statusText}`);
    }

    if (onStream && requestBody.stream) {
      return await this.handleSiliconFlowStream(response, onStream);
    } else {
      const data: any = await response.json();
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalCost: 0
        }
      };
    }
  }

  private async handleSiliconFlowStream(
    response: Response,
    onStream: (chunk: ApiStreamChunk) => void
  ): Promise<ApiResponse> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };

    if (!reader) {
      throw new Error('No response body reader available');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              
              if (delta?.content) {
                content += delta.content;
                onStream({
                  type: 'text',
                  content: delta.content
                });
              }

              if (parsed.usage) {
                usage = {
                  inputTokens: parsed.usage.prompt_tokens || 0,
                  outputTokens: parsed.usage.completion_tokens || 0,
                  totalCost: 0
                };
              }
            } catch (e) {
              // 忽略解析错误的行
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content, usage };
  }

  updateConfiguration(config: Partial<ApiConfiguration>): void {
    this.config = { ...this.config, ...config };
  }

  getConfiguration(): ApiConfiguration {
    return { ...this.config };
  }
}