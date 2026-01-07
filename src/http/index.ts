/**
 * HTTP Analysis Module
 * Export all HTTP-related functionality
 */

// Core analysis functions
export { analyzeHttpRequest } from './requestAnalyzer';

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
} from './types';

// Utilities
export { applyRedaction, validateRedaction, hashForDedup } from './utils/redaction';
