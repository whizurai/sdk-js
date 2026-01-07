/**
 * Content Client
 * 
 * Client for AI-Labs content generation service (generative service)
 */

import axios, { AxiosInstance } from 'axios';

export interface ContentClientConfig {
  /** Generative service URL */
  generativeServiceUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface ContentGenerateRequest {
  /** Type of content to generate */
  type: 'title' | 'description' | 'text' | 'name' | 'email' | 'address' | 'custom';
  /** Context or topic for generation */
  context?: string;
  /** Number of items to generate */
  count?: number;
  /** Additional parameters */
  parameters?: Record<string, unknown>;
  /** Optional user identifier for tracking */
  userId?: string;
}

export interface ContentGenerateResponse {
  /** Generated content items */
  items: string[];
  /** Model used */
  model: string;
  /** Cost in cents */
  costCents: number;
  /** Creation timestamp */
  createdAt: string;
  /** Whether this was a cache hit */
  cacheHit: boolean;
}

/**
 * Content Client for interacting with AI-Labs generative service
 */
export class ContentClient {
  private client: AxiosInstance;
  private config: ContentClientConfig;
  private readonly DEFAULT_TIMEOUT = 30000;

  constructor(config: ContentClientConfig) {
    this.config = {
      timeout: this.DEFAULT_TIMEOUT,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.generativeServiceUrl,
      timeout: this.config.timeout ?? 30000, // Default to 30 seconds if undefined
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  /**
   * Generate content based on type and context
   */
  async generate(request: ContentGenerateRequest): Promise<ContentGenerateResponse> {
    try {
      // Map content type to appropriate prompt
      const prompt = this.buildPrompt(request.type, request.context, request.parameters);
      
      const payload = {
        prompt,
        model: 'gpt-3.5-turbo', // Use cheaper model for content generation
        max_tokens: 500,
        temperature: 0.8,
        n: request.count || 1,
        ...(request.userId && { user_id: request.userId }),
      };

      // For now, use the model-router endpoint directly
      // In the future, this could use a dedicated content generation endpoint
      const response = await this.client.post('/v1/chat/completions', payload);
      const data = response.data;

      // Extract content from response
      const items: string[] = [];
      if (data.choices && Array.isArray(data.choices)) {
        for (const choice of data.choices) {
          const content = choice.message?.content || choice.text || '';
          if (request.count && request.count > 1) {
            // Split by newlines if multiple items requested
            items.push(...content.split('\n').filter((line: string) => line.trim()));
          } else {
            items.push(content);
          }
        }
      }

      return {
        items: items.slice(0, request.count || 1),
        model: data.model || 'gpt-3.5-turbo',
        costCents: this.estimateCost(data.usage?.total_tokens || 0),
        createdAt: new Date().toISOString(),
        cacheHit: false,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;

        if (status === 429) {
          throw new Error(`Rate limit exceeded: ${message}`);
        }
        if (status === 401 || status === 403) {
          throw new Error(`Authentication failed: ${message}`);
        }
        if (status && status >= 500) {
          throw new Error(`Content service error: ${message}`);
        }
        
        throw new Error(`Content generation failed: ${message}`);
      }

      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  /**
   * Build prompt based on content type
   */
  private buildPrompt(
    type: ContentGenerateRequest['type'],
    context?: string,
    parameters?: Record<string, unknown>
  ): string {
    const basePrompts: Record<string, string> = {
      title: `Generate a realistic ${context || 'product'} title. Make it concise and engaging.`,
      description: `Generate a realistic ${context || 'product'} description. Make it detailed and compelling.`,
      text: `Generate realistic text content about ${context || 'a topic'}.`,
      name: `Generate a realistic ${context || 'person'} name.`,
      email: `Generate a realistic email address${context ? ` for ${context}` : ''}.`,
      address: `Generate a realistic ${context || 'street'} address.`,
      custom: context || 'Generate realistic content.',
    };

    let prompt = basePrompts[type] || basePrompts.custom;

    if (parameters) {
      const paramStr = Object.entries(parameters)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      prompt += ` Parameters: ${paramStr}`;
    }

    return prompt;
  }

  /**
   * Estimate cost based on token count
   */
  private estimateCost(totalTokens: number): number {
    // GPT-3.5-turbo: ~$0.002 per 1K tokens
    const pricePerToken = 0.002 / 1000;
    return Math.round(totalTokens * pricePerToken * 100); // Convert to cents
  }

  /**
   * Health check
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
 * Create a content client instance
 */
export function createContentClient(config: ContentClientConfig): ContentClient {
  return new ContentClient(config);
}

