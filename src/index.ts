/**
 * Whizurai TypeScript/JavaScript SDK
 *
 * Official SDK for the Whizurai Platform providing easy access
 * to all platform services and capabilities.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface WhizuraiConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface GenerateRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EnrichRequest {
  content: string;
  type: 'text' | 'image';
  options?: Record<string, unknown>;
}

export interface EnrichResponse {
  tags: string[];
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResponse {
  results: Array<{
    id: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  total: number;
}

export interface RecommendRequest {
  userId: string;
  itemId?: string;
  limit?: number;
}

export interface RecommendResponse {
  recommendations: Array<{
    id: string;
    score: number;
    reason: string;
  }>;
}

export interface ModerateRequest {
  content: string;
  type: 'text' | 'image';
}

export interface ModerateResponse {
  safe: boolean;
  confidence: number;
  categories: string[];
  explanation: string;
}

export interface UploadResponse {
  id: string;
  url: string;
  size: number;
  type: string;
}

export interface PrintRenditionRequest {
  generationId: string;
  sourceUrl: string;
  targetWidth?: number;
  targetHeight?: number;
  targetDpi?: number;
  printType?: 'poster' | 'canvas' | 'apparel' | 'framed';
  format?: 'png' | 'jpeg';
  colorProfile?: 'sRGB' | 'AdobeRGB' | 'CMYK';
  addBleed?: boolean;
  enhanceQuality?: boolean;
}

export interface PrintRenditionResponse {
  generationId: string;
  printFileUrl: string;
  width: number;
  height: number;
  dpi: number;
  format: string;
  fileSize: number;
  colorProfile: string;
  processingTime: number;
  enhancementsApplied: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
}

export class WhizuraiClient {
  private client: AxiosInstance;
  private config: WhizuraiConfig;

  constructor(config: WhizuraiConfig) {
    this.config = {
      baseUrl: 'https://api.whizurai.com',
      timeout: 30000,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl || 'https://api.whizurai.com',
      timeout: this.config.timeout || 30000,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'whizurai-sdk-js/1.0.0',
      },
    });

    // Add request/response interceptors
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Log request in development only
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log(`Making request to ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        // eslint-disable-next-line no-console
        console.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Log response in development only
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log(`Response received: ${response.status} ${response.statusText}`);
        }
        return response;
      },
      (error: AxiosError) => {
        const errorMessage = error.response?.data || error.message;
        // eslint-disable-next-line no-console
        console.error('Response error:', errorMessage);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate content using AI models
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    try {
      const response = await this.client.post('/v1/generate', request);
      return response.data as GenerateResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate content: ${errorMessage}`);
    }
  }

  /**
   * Enrich content with AI capabilities
   */
  async enrich(request: EnrichRequest): Promise<EnrichResponse> {
    try {
      const response = await this.client.post('/v1/enrich', request);
      return response.data as EnrichResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to enrich content: ${errorMessage}`);
    }
  }

  /**
   * Perform semantic search
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      const response = await this.client.post('/v1/search', request);
      return response.data as SearchResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to search: ${errorMessage}`);
    }
  }

  /**
   * Get recommendations
   */
  async recommend(request: RecommendRequest): Promise<RecommendResponse> {
    try {
      const response = await this.client.post('/v1/recommend', request);
      return response.data as RecommendResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get recommendations: ${errorMessage}`);
    }
  }

  /**
   * Moderate content
   */
  async moderate(request: ModerateRequest): Promise<ModerateResponse> {
    try {
      const response = await this.client.post('/v1/moderate', request);
      return response.data as ModerateResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to moderate content: ${errorMessage}`);
    }
  }

  /**
   * Upload file
   */
  async uploadFile(file: File, options?: Record<string, unknown>): Promise<UploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await this.client.post('/v1/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: options,
      });
      return response.data as UploadResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to upload file: ${errorMessage}`);
    }
  }

  /**
   * Create print-ready rendition from generation
   */
  async createPrintRendition(
    request: PrintRenditionRequest
  ): Promise<PrintRenditionResponse> {
    try {
      const payload = {
        generation_id: request.generationId,
        source_url: request.sourceUrl,
        target_width: request.targetWidth || 4096,
        target_height: request.targetHeight || 4096,
        target_dpi: request.targetDpi || 300,
        print_type: request.printType || 'poster',
        format: request.format || 'png',
        color_profile: request.colorProfile || 'sRGB',
        add_bleed: request.addBleed || false,
        enhance_quality: request.enhanceQuality !== false,
      };

      const response = await this.client.post('/v1/print-rendition', payload);
      
      // Convert snake_case response to camelCase
      const data = response.data;
      return {
        generationId: data.generation_id,
        printFileUrl: data.print_file_url,
        width: data.width,
        height: data.height,
        dpi: data.dpi,
        format: data.format,
        fileSize: data.file_size,
        colorProfile: data.color_profile,
        processingTime: data.processing_time,
        enhancementsApplied: data.enhancements_applied || [],
        createdAt: data.created_at,
        metadata: data.metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create print rendition: ${errorMessage}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthResponse> {
    try {
      const response = await this.client.get('/health');
      return response.data as HealthResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Health check failed: ${errorMessage}`);
    }
  }
}

// Export default client factory
export function createClient(config: WhizuraiConfig): WhizuraiClient {
  return new WhizuraiClient(config);
}

// Export types and client
export default WhizuraiClient;

// Export mock API builder module
export * from './mock';
