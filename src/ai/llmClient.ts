/**
 * LLM Client - Abstracts LLM provider access via model-router service
 */

import axios, { AxiosInstance } from 'axios';
import type {
  LLMChatRequest,
  LLMChatResponse,
} from '../http/types';

export interface LLMClientConfig {
  /** Model router service URL */
  modelRouterUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Default model to use */
  defaultModel?: string;
  
  /** Enable retry logic */
  enableRetry?: boolean;
  
  /** Max retries on failure */
  maxRetries?: number;
}

/**
 * LLM Client for interacting with model-router service
 */
export class LLMClient {
  private client: AxiosInstance;
  private config: LLMClientConfig;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly DEFAULT_MODEL = 'gpt-3.5-turbo';
  private readonly DEFAULT_MAX_RETRIES = 3;

  constructor(config: LLMClientConfig) {
    this.config = {
      timeout: this.DEFAULT_TIMEOUT,
      defaultModel: this.DEFAULT_MODEL,
      enableRetry: true,
      maxRetries: this.DEFAULT_MAX_RETRIES,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.modelRouterUrl,
      timeout: this.config.timeout ?? 30000, // Default to 30 seconds if undefined
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  /**
   * Send a chat completion request to the LLM
   */
  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const model = request.model || this.config.defaultModel || this.DEFAULT_MODEL;
    
    const payload = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048, // Default to 2048 tokens if undefined
      response_format: request.responseFormat === 'json_object' 
        ? { type: 'json_object' } 
        : undefined,
    };

    return this.executeWithRetry(async () => {
      const response = await this.client.post('/v1/chat/completions', payload);
      
      return this.parseResponse(response.data, model);
    });
  }

  /**
   * Simple completion with a single prompt
   */
  async complete(prompt: string, options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    system?: string;
  }): Promise<string> {
    const messages: LLMChatRequest['messages'] = [];
    
    if (options?.system) {
      messages.push({ role: 'system', content: options.system });
    }
    
    messages.push({ role: 'user', content: prompt });

    const chatRequest: any = {
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
    
    // Only add model if we have a defined value
    const modelValue = options?.model ?? this.config.defaultModel ?? this.DEFAULT_MODEL;
    if (modelValue !== undefined) {
      chatRequest.model = modelValue;
    }
    
    const response = await this.chat(chatRequest);

    return response.content;
  }

  /**
   * Request structured JSON output
   */
  async chatJSON<T = unknown>(request: LLMChatRequest): Promise<T> {
    const response = await this.chat({
      ...request,
      responseFormat: 'json_object',
    });

    try {
      return JSON.parse(response.content) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const maxRetries = this.config.maxRetries || this.DEFAULT_MAX_RETRIES;
      
      if (!this.config.enableRetry || attempt >= maxRetries) {
        throw this.handleError(error);
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = Math.pow(2, attempt - 1) * 1000;
      await this.sleep(backoffMs);

      return this.executeWithRetry(fn, attempt + 1);
    }
  }

  /**
   * Parse model-router response into standard format
   */
  private parseResponse(data: any, model: string): LLMChatResponse {
    // Handle OpenAI-style response
    if (data.choices && data.choices[0]) {
      const choice = data.choices[0];
      const usage = data.usage || {};
      
      return {
        content: choice.message?.content || choice.text || '',
        model: data.model || model,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        costUsd: this.estimateCost(model, usage.total_tokens || 0),
      };
    }

    // Handle Anthropic/Claude-style response
    if (data.content && Array.isArray(data.content)) {
      return {
        content: data.content.map((c: any) => c.text).join(''),
        model: data.model || model,
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        finishReason: this.mapFinishReason(data.stop_reason),
      };
    }

    // Fallback for unknown format
    throw new Error('Unexpected response format from model-router');
  }

  /**
   * Map provider-specific finish reasons to standard format
   */
  private mapFinishReason(reason: string | undefined): LLMChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
      case 'end_turn':
        return 'stop';
      case 'length':
      case 'max_tokens':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'function_call':
      case 'tool_use':
        return 'function_call';
      default:
        return 'stop';
    }
  }

  /**
   * Estimate cost based on model and token count
   */
  private estimateCost(model: string, totalTokens: number): number {
    // Rough pricing estimates (per 1K tokens) - should be configurable
    const pricing: Record<string, number> = {
      'gpt-3.5-turbo': 0.002,
      'gpt-4': 0.03,
      'gpt-4-turbo': 0.01,
      'claude-3-sonnet': 0.015,
      'claude-3-opus': 0.075,
    };

    const pricePerToken = (pricing[model] || 0.002) / 1000;
    return totalTokens * pricePerToken;
  }

  /**
   * Handle errors and convert to user-friendly format
   */
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message;

      if (status === 429) {
        return new Error(`Rate limit exceeded: ${message}`);
      }
      if (status === 401 || status === 403) {
        return new Error(`Authentication failed: ${message}`);
      }
      if (status && status >= 500) {
        return new Error(`Model router service error: ${message}`);
      }
      
      return new Error(`LLM request failed: ${message}`);
    }

    return error instanceof Error ? error : new Error('Unknown error');
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection to model-router
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an LLM client instance
 */
export function createLLMClient(config: LLMClientConfig): LLMClient {
  return new LLMClient(config);
}
