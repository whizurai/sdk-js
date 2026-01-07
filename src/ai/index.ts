/**
 * AI Module
 * Export LLM, embeddings, image, and content clients
 */

export { LLMClient, createLLMClient } from './llmClient';
export type { LLMClientConfig } from './llmClient';

export { EmbeddingsClient, createEmbeddingsClient } from './embeddingsClient';
export type { EmbeddingsClientConfig } from './embeddingsClient';

export { ImageClient, createImageClient } from './imageClient';
export type { 
  ImageClientConfig, 
  ImageGenerateRequest, 
  ImageGenerateResponse 
} from './imageClient';

export { ContentClient, createContentClient } from './contentClient';
export type { 
  ContentClientConfig, 
  ContentGenerateRequest, 
  ContentGenerateResponse 
} from './contentClient';

// Re-export types used by clients
export type {
  LLMChatRequest,
  LLMChatResponse,
  EmbeddingsRequest,
  EmbeddingsResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  VectorSearchResult,
} from '../http/types';
