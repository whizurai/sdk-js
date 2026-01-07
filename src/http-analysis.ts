/**
 * HTTP Analysis Entry Point
 * Main export file for @whizurai/sdk-js HTTP analysis features
 */

// AI Clients
export {
  LLMClient,
  createLLMClient,
  EmbeddingsClient,
  createEmbeddingsClient,
} from './ai';
export type {
  LLMClientConfig,
  EmbeddingsClientConfig,
} from './ai';

// HTTP Analysis
export {
  analyzeHttpRequest,
  applyRedaction,
  validateRedaction,
  hashForDedup,
} from './http';

// Schema Inference (Phase 3)
export {
  inferEndpointSchema,
  inferApiMap,
  toOpenApiPathItem,
  toOpenApiSpec,
} from './http-analysis/schemaInference';

// Request Diff (Phase 4)
export {
  compareRequests,
} from './http-analysis/requestDiff';

// Webhook Classification (Phase 4)
export {
  classifyWebhook,
} from './http-analysis/webhookClassifier';

export {
  normalizePath,
  normalizeAndGroupPaths,
  extractPathParams,
  pathMatchesTemplate,
  mergePaths,
} from './http-analysis/utils/pathNormalization';

export {
  mergeJsonSamples,
  mergeRequestBodies,
  toOpenApiSchema,
} from './http-analysis/utils/jsonMerge';

// Types
export type {
  HttpRequestSnapshot,
  RequestAnalysisResult,
  RequestAnalysisOptions,
  RequestIssue,
  RequestSuggestion,
  ReplayMode,
  ReplayVariant,
  ReplayOptions,
  ApiSchemaInferenceResult,
  DiscoveredEndpoint,
  ErrorDiagnosisResult,
  ProbableCause,
  SimilarError,
  RequestDiffResult,
  StructuralDiff,
  DiffSection,
  ChangedField,
  ResponseDiff,
  WebhookClassificationResult,
  ApiDocsBundle,
  SimilarityOptions,
  RedactedSnapshot,
  LLMChatRequest,
  LLMChatResponse,
  EmbeddingsRequest,
  EmbeddingsResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  VectorSearchResult,
} from './http/types';

// Phase 3 Types
export type {
  InferredEndpoint,
  ApiMap,
  AuthPattern,
  DetectedAuthPattern,
  SchemaInferenceOptions,
} from './http-analysis/schemaInference';

export type {
  NormalizedPath,
  NormalizedSegment,
  SegmentType,
  PathNormalizationOptions,
} from './http-analysis/utils/pathNormalization';

export type {
  JsonSchema,
  JsonSchemaType,
  SchemaMergeOptions,
} from './http-analysis/utils/jsonMerge';
