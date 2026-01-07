/**
 * Mock API Builder Module
 * 
 * Provides AI-powered mock API generation capabilities including:
 * - Prompt-based API generation
 * - Schema inference from TypeScript, OpenAPI, JSON
 * - Realistic data generation with AI integration
 */

export { parsePrompt, type PromptParseOptions, type PromptParseResult } from './promptParser';
export { 
  inferFromTypeScript, 
  inferFromOpenAPI, 
  inferFromJSON,
  type SchemaInferenceResult 
} from './schemaInference';
export { 
  generateData, 
  type DataGenerationOptions, 
  type GeneratedData 
} from './dataGenerator';
export { 
  analyzeTypeScript, 
  type TypeScriptAnalysisResult 
} from './typeAnalyzer';
export { 
  parseOpenAPI, 
  type OpenAPIParseResult 
} from './openapiParser';

// Re-export types
export type {
  EntityDefinition,
  FieldDefinition,
  RelationshipDefinition,
  EndpointDefinition,
  OperationDefinition,
  EntitySchema,
} from './types';

