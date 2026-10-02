/**
 * Embeddings Client - Abstracts vector search and embeddings via vector-search service
 */

import axios, { AxiosInstance } from 'axios';
import type {
  EmbeddingsRequest,
  EmbeddingsResponse,
  VectorSearchRequest,
  VectorSearchResponse,
} from '../http/types';

export interface EmbeddingsClientConfig {
  /** Vector search service URL */
  vectorSearchUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /**
   * Embedding model used when a request names none. There is deliberately no
   * built-in default: the model fixes the vector space, so it must be chosen
   * explicitly (e.g. `embedding-qwen3-0.6b-v1`).
   */
  defaultModel?: string;
}

/**
 * Embeddings and Vector Search Client
 */
export class EmbeddingsClient {
  private client: AxiosInstance;
  private config: EmbeddingsClientConfig;
  private readonly DEFAULT_TIMEOUT = 30000;

  constructor(config: EmbeddingsClientConfig) {
    this.config = {
      timeout: this.DEFAULT_TIMEOUT,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.vectorSearchUrl,
      timeout: this.config.timeout ?? 30000, // Default to 30 seconds if undefined
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  /**
   * Generate embeddings for text
   */
  async embed(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const model = request.model || this.config.defaultModel;
    if (!model) {
      throw new Error(
        'EmbeddingsClient.embed requires a model (request.model or config.defaultModel); ' +
          'there is no default because the model fixes the vector space.'
      );
    }

    try {
      const response = await this.client.post('/v1/embeddings', {
        text: request.text,
        model,
        tenant_id: request.tenantId,
      });

      const data = response.data;

      // Handle OpenAI-style response
      if (data.data && Array.isArray(data.data)) {
        return {
          embedding: data.data[0].embedding,
          dimensions: data.data[0].embedding.length,
          model: data.model || model,
          tokensUsed: data.usage?.total_tokens,
          ...(data.whizai && { whizai: data.whizai }),
          ...(data.whizai?.embedding_space && { embeddingSpace: data.whizai.embedding_space }),
        };
      }

      // Handle direct embedding response
      if (Array.isArray(data.embedding)) {
        return {
          embedding: data.embedding,
          dimensions: data.embedding.length,
          model: data.model || model,
          tokensUsed: data.tokens_used,
        };
      }

      throw new Error('Unexpected embeddings response format');
    } catch (error) {
      throw this.handleError(error, 'Failed to generate embeddings');
    }
  }

  /**
   * Perform vector similarity search
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    try {
      // If query is text, embed it first
      let queryVector: number[];
      
      if (typeof request.query === 'string') {
        const embedRequest: any = {
          text: request.query,
        };
        if (request.model !== undefined) {
          embedRequest.model = request.model;
        }
        if (request.tenantId !== undefined) {
          embedRequest.tenantId = request.tenantId;
        }
        const embeddingResult = await this.embed(embedRequest);
        queryVector = embeddingResult.embedding;
      } else {
        queryVector = request.query;
      }

      const response = await this.client.post('/v1/search', {
        collection: request.collection,
        query_vector: queryVector,
        limit: request.limit || 20,
        min_score: request.minScore || 0.7,
        filter: {
          ...request.filter,
          ...(request.tenantId && { tenant_id: request.tenantId }),
        },
      });

      const data = response.data;

      return {
        results: (data.results || []).map((result: any) => ({
          id: result.id,
          score: result.score,
          payload: result.payload || result.metadata || {},
        })),
        total: data.total || data.results?.length || 0,
      };
    } catch (error) {
      throw this.handleError(error, 'Vector search failed');
    }
  }

  /**
   * Store a vector in a collection
   */
  async upsert(params: {
    collection: string;
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
    tenantId?: string;
  }): Promise<void> {
    try {
      await this.client.post('/v1/upsert', {
        collection: params.collection,
        id: params.id,
        vector: params.vector,
        payload: {
          ...params.payload,
          ...(params.tenantId && { tenant_id: params.tenantId }),
        },
      });
    } catch (error) {
      throw this.handleError(error, 'Failed to upsert vector');
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(params: {
    name: string;
    dimension: number;
    distance?: 'cosine' | 'euclidean' | 'dot';
  }): Promise<void> {
    try {
      await this.client.post('/v1/collections', {
        name: params.name,
        dimension: params.dimension,
        distance: params.distance || 'cosine',
      });
    } catch (error) {
      throw this.handleError(error, 'Failed to create collection');
    }
  }

  /**
   * Delete vectors by filter
   */
  async delete(params: {
    collection: string;
    filter: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.client.post('/v1/delete', {
        collection: params.collection,
        filter: params.filter,
      });
    } catch (error) {
      throw this.handleError(error, 'Failed to delete vectors');
    }
  }

  /**
   * Handle errors and convert to user-friendly format
   */
  private handleError(error: unknown, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message;

      if (status === 404) {
        return new Error(`Collection not found: ${message}`);
      }
      if (status === 429) {
        return new Error(`Rate limit exceeded: ${message}`);
      }
      if (status === 401 || status === 403) {
        return new Error(`Authentication failed: ${message}`);
      }
      
      return new Error(`${defaultMessage}: ${message}`);
    }

    return error instanceof Error ? error : new Error(defaultMessage);
  }

  /**
   * Test connection to vector-search service
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
 * Create an embeddings client instance
 */
export function createEmbeddingsClient(config: EmbeddingsClientConfig): EmbeddingsClient {
  return new EmbeddingsClient(config);
}
