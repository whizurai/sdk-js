/**
 * Image Client
 * 
 * Client for AI-Labs image generation service
 */

import axios, { AxiosInstance } from 'axios';

export interface ImageClientConfig {
  /** Image service URL */
  imageServiceUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface ImageGenerateRequest {
  /** Text description of the image to generate */
  prompt: string;
  /** Model to use: 'dall-e-2' or 'dall-e-3' (default: 'dall-e-3') */
  model?: 'dall-e-2' | 'dall-e-3';
  /** Image size */
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  /** Image quality: 'standard' or 'hd' (DALL-E 3 only) */
  quality?: 'standard' | 'hd';
  /** Image style: 'vivid' or 'natural' (DALL-E 3 only) */
  style?: 'vivid' | 'natural';
  /** Number of images to generate (1-10 for DALL-E 2, 1 for DALL-E 3) */
  n?: number;
  /** Optional user identifier for tracking */
  userId?: string;
}

export interface ImageGenerateResponse {
  /** Generated images */
  images: Array<{
    url: string;
    revised_prompt?: string;
    b64_json?: string;
  }>;
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
 * Image Client for interacting with AI-Labs image service
 */
export class ImageClient {
  private client: AxiosInstance;
  private config: ImageClientConfig;
  private readonly DEFAULT_TIMEOUT = 60000; // 60s for image generation

  constructor(config: ImageClientConfig) {
    this.config = {
      timeout: this.DEFAULT_TIMEOUT,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.imageServiceUrl,
      timeout: this.config.timeout ?? 60000, // Default to 60 seconds if undefined
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  /**
   * Generate images from a text prompt
   */
  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResponse> {
    try {
      const payload = {
        prompt: request.prompt,
        model: request.model || 'dall-e-3',
        size: request.size || '1024x1024',
        quality: request.quality || 'standard',
        style: request.style || 'vivid',
        n: request.n || 1,
        ...(request.userId && { user_id: request.userId }),
      };

      const response = await this.client.post('/v1/image/generate', payload);
      const data = response.data;

      return {
        images: data.images || [],
        model: data.model || request.model || 'dall-e-3',
        costCents: data.cost_cents || 0,
        createdAt: data.created_at || new Date().toISOString(),
        cacheHit: data.cache_hit || false,
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
          throw new Error(`Image service error: ${message}`);
        }
        
        throw new Error(`Image generation failed: ${message}`);
      }

      throw error instanceof Error ? error : new Error('Unknown error');
    }
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
 * Create an image client instance
 */
export function createImageClient(config: ImageClientConfig): ImageClient {
  return new ImageClient(config);
}

