/**
 * Core types for HTTP analysis
 * Generic types that work across any HTTP implementation
 */

/**
 * Generic HTTP request snapshot - product-agnostic
 */
export interface HttpRequestSnapshot {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  
  /** Full request URL */
  url: string;
  
  /** Request headers */
  headers: Record<string, string>;
  
  /** Query parameters */
  queryParams?: Record<string, string>;
  
  /** Request body (may be string, object, or Buffer) */
  body?: unknown;
  
  /** Content-Type header value */
  contentType?: string;
  
  /** Request timestamp */
  timestamp?: Date;
  
  /** Optional response data */
  response?: {
    statusCode: number;
    headers: Record<string, string>;
    body?: unknown;
    latencyMs?: number;
  };
}

/**
 * Result of HTTP request analysis
 */
export interface RequestAnalysisResult {
  /** Human-readable summary (1-2 sentences) */
  summary: string;
  
  /** Classification tag (e.g., "oauth_callback", "crud:update") */
  classification: string;
  
  /** Detected issues */
  issues: RequestIssue[];
  
  /** Actionable suggestions */
  suggestions: RequestSuggestion[];
  
  /** Raw AI metadata for debugging */
  rawAiMetadata?: unknown;
  
  /** Model used for analysis */
  modelUsed?: string;
  
  /** Tokens consumed */
  tokensUsed?: number;
  
  /** Estimated cost in USD */
  costUsd?: number;
  
  /** Whether this came from deterministic analysis only */
  deterministicOnly?: boolean;
}

export interface RequestIssue {
  /** Issue type identifier */
  type: string;
  
  /** Affected field/header name */
  field?: string;
  
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Human-readable description */
  description: string;
  
  /** Additional evidence or context */
  evidence?: string;
}

export interface RequestSuggestion {
  /** Related issue type */
  issueType: string;
  
  /** Suggestion text */
  suggestion: string;
  
  /** Optional code snippet */
  codeSnippet?: string;
}

/**
 * Options for request analysis
 */
export interface RequestAnalysisOptions {
  /** Skip LLM analysis, only run deterministic checks */
  skipLLM?: boolean;
  
  /** Force analysis even if cached */
  force?: boolean;
  
  /** Include similar requests from history */
  includeSimilar?: boolean;
  
  /** Similarity search options */
  similarityOptions?: SimilarityOptions;
}

/**
 * Replay mode types
 */
export type ReplayMode = 'fuzzy' | 'boundary' | 'security' | 'load' | 'divergence';

/**
 * Replay variant generated from base request
 */
export interface ReplayVariant {
  /** Unique identifier for this variant */
  id: string;
  
  /** Human-readable description */
  description: string;
  
  /** Diff summary */
  diffSummary: string;
  
  /** Modified request snapshot */
  requestSnapshot: HttpRequestSnapshot;
  
  /** Mutation type applied */
  mutationType: string;
}

/**
 * Options for replay variant generation
 */
export interface ReplayOptions {
  /** Number of variants to generate (mode-dependent default) */
  variantCount?: number;
  
  /** Preserve authentication headers */
  preserveAuth?: boolean;
  
  /** Preserve specific headers */
  preserveHeaders?: string[];
  
  /** Skip LLM for divergence mode */
  skipLLM?: boolean;
}

/**
 * Schema inference result for discovered API endpoints
 */
export interface ApiSchemaInferenceResult {
  /** Discovered endpoints */
  endpoints: DiscoveredEndpoint[];
  
  /** Total requests analyzed */
  requestCount: number;
  
  /** Metadata about inference process */
  metadata?: {
    inferredAt: Date;
    timeRange?: { start: Date; end: Date };
  };
}

export interface DiscoveredEndpoint {
  /** HTTP method */
  method: string;
  
  /** Normalized path pattern (e.g., /users/{id}/orders) */
  pathPattern: string;
  
  /** AI-generated description */
  description?: string;
  
  /** Detected authentication pattern */
  authPattern?: 'bearer_token' | 'api_key' | 'basic_auth' | 'cookie' | 'none';
  
  /** Request schema (JSON Schema-like) */
  requestSchema?: unknown;
  
  /** Response schemas by status code */
  responseSchemas?: Record<number, unknown>;
  
  /** Example requests (anonymized) */
  examples?: HttpRequestSnapshot[];
  
  /** Observation count */
  requestCount: number;
  
  /** Error rate (0.0 - 1.0) */
  errorRate?: number;
}

/**
 * Error diagnosis result
 */
export interface ErrorDiagnosisResult {
  /** HTTP status code of the error */
  statusCode: number;
  
  /** Probable causes ranked by confidence */
  probableCauses: ProbableCause[];
  
  /** Recommended debugging steps */
  recommendedSteps: string[];
  
  /** Similar past errors */
  similarErrors?: SimilarError[];
  
  /** Model used */
  modelUsed?: string;
  
  /** Deterministic only flag */
  deterministicOnly?: boolean;
}

export interface ProbableCause {
  /** Cause description */
  cause: string;
  
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  
  /** Supporting evidence */
  evidence?: string;
  
  /** Severity level */
  severity?: 'info' | 'warning' | 'critical';
  
  /** Error class */
  class?: 'validation' | 'auth' | 'rate-limit' | 'server-fault' | 'unknown';
}

export interface SimilarError {
  /** Request ID of similar error */
  requestId?: string;
  
  /** Similarity score (0.0 - 1.0) */
  similarityScore: number;
  
  /** Timestamp of similar error */
  timestamp?: Date;
  
  /** Brief summary */
  summary?: string;
}

/**
 * Request diff result
 */
export interface RequestDiffResult {
  /** Base request ID */
  baseRequestId?: string;
  
  /** Compare request ID */
  compareRequestId?: string;
  
  /** Structural diff */
  structuralDiff: StructuralDiff;
  
  /** AI-generated narrative explaining differences */
  aiNarrative?: string;
  
  /** Key differences summary */
  keyDifferences: string[];
}

export interface StructuralDiff {
  headers?: DiffSection;
  queryParams?: DiffSection;
  body?: DiffSection;
  response?: ResponseDiff;
}

export interface DiffSection {
  added?: string[];
  removed?: string[];
  changed?: ChangedField[];
}

export interface ChangedField {
  key?: string;
  path?: string;
  from: unknown;
  to: unknown;
}

export interface ResponseDiff {
  statusCode?: { from: number; to: number };
  bodyChanges?: ChangedField[];
}

/**
 * Webhook classification result
 */
export interface WebhookClassificationResult {
  /** Detected provider (stripe, shopify, github, etc.) */
  provider: string;
  
  /** Event type (payment_intent.succeeded, orders/create, etc.) */
  eventType: string;
  
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  
  /** Detection method used */
  detectionMethod: 'header' | 'body_pattern' | 'llm' | 'combined';
  
  /** Recommended idempotency key field */
  idempotencyKeyHint?: string;
  
  /** Cluster ID for similar events */
  clusterId?: string;
  
  /** Whether this is likely a retry */
  isRetry?: boolean;
  
  /** Detected retry count */
  retryCount?: number;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generated API documentation bundle
 */
export interface ApiDocsBundle {
  /** Markdown documentation */
  markdown: string;
  
  /** OpenAPI JSON specification */
  openapi: unknown;
  
  /** HTML documentation (optional) */
  html?: string;
  
  /** Metadata */
  metadata: {
    generatedAt: Date;
    model?: string;
    version: string;
  };
}

/**
 * Similarity search options
 */
export interface SimilarityOptions {
  /** Maximum number of neighbors to return */
  maxNeighbors: number;
  
  /** Minimum similarity score (cosine) */
  minScore: number;
  
  /** Enforce same-tenant filtering (required for R3VERB) */
  sameTenantOnly: boolean;
  
  /** Optional tenant ID for filtering */
  tenantId?: string;
}

/**
 * LLM chat completion request
 */
export interface LLMChatRequest {
  /** System message (role instructions) */
  system?: string;
  
  /** User message (prompt) */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  
  /** Model name (e.g., "gpt-4", "claude-3-sonnet") */
  model?: string;
  
  /** Temperature (0.0 - 2.0) */
  temperature?: number;
  
  /** Max tokens to generate */
  maxTokens?: number;
  
  /** Response format (json_object for structured output) */
  responseFormat?: 'text' | 'json_object';
}

/**
 * LLM chat completion response
 */
export interface LLMChatResponse {
  /** Generated content */
  content: string;
  
  /** Model used */
  model: string;
  
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'function_call';
  
  /** Estimated cost in USD */
  costUsd?: number;
}

/**
 * Embeddings generation request
 */
export interface EmbeddingsRequest {
  /** Text to embed */
  text: string;
  
  /** Model to use (e.g., "embedding-qwen3-0.6b-v1"). Falls back to the client's `defaultModel`; there is no built-in default. */
  model?: string;
  
  /** Optional tenant ID for scoping */
  tenantId?: string;
}

/**
 * Embeddings generation response
 */
export interface EmbeddingsResponse {
  /** Embedding vector */
  embedding: number[];
  
  /** Dimensions */
  dimensions: number;
  
  /** Model used */
  model: string;
  
  /** Token usage */
  tokensUsed?: number;

  /** Vector-space identity (`whizai.embedding_space`), when the platform reports it. */
  embeddingSpace?: string;

  /** Raw provenance block from the platform, when present. */
  whizai?: import('../types/inference').EmbeddingProvenance;
}

/**
 * Vector search request
 */
export interface VectorSearchRequest {
  /** Query embedding or text */
  query: number[] | string;

  /** Embedding model for a text query (falls back to the client's `defaultModel`). */
  model?: string;
  
  /** Collection name */
  collection: string;
  
  /** Maximum results */
  limit?: number;
  
  /** Minimum similarity score */
  minScore?: number;
  
  /** Filter by metadata */
  filter?: Record<string, unknown>;
  
  /** Tenant ID for filtering */
  tenantId?: string;
}

/**
 * Vector search response
 */
export interface VectorSearchResponse {
  /** Search results */
  results: VectorSearchResult[];
  
  /** Total count */
  total: number;
}

export interface VectorSearchResult {
  /** Result ID */
  id: string;
  
  /** Similarity score */
  score: number;
  
  /** Payload/metadata */
  payload: Record<string, unknown>;
}

/**
 * Redacted snapshot with redaction metadata
 */
export interface RedactedSnapshot {
  /** Redacted request snapshot */
  snapshot: HttpRequestSnapshot;
  
  /** Redaction applied flag */
  redactionApplied: boolean;
  
  /** Fields that were redacted */
  redactedFields: string[];
}
