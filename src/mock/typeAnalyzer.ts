/**
 * Type Analyzer
 * 
 * Analyzes TypeScript files to extract types, interfaces, and API patterns
 */

import { LLMClient } from '../ai/llmClient';
import type { EntitySchema, EndpointDefinition, RelationshipDefinition } from './types';

export interface TypeScriptAnalysisOptions {
  /** LLM client instance (optional) */
  llmClient?: LLMClient;
  /** Analyze React component props (default: true) */
  analyzeComponents?: boolean;
  /** Analyze API client code (default: true) */
  analyzeApiClients?: boolean;
}

export interface TypeScriptAnalysisResult {
  entities: EntitySchema[];
  endpoints: EndpointDefinition[];
  relationships: RelationshipDefinition[];
  /** Detected API patterns */
  patterns: {
    type: 'react-component' | 'api-client' | 'type-definition';
    file?: string;
    details: Record<string, unknown>;
  }[];
}

/**
 * Analyze TypeScript file content to extract types and API patterns
 */
export async function analyzeTypeScript(
  fileContent: string,
  options?: TypeScriptAnalysisOptions
): Promise<TypeScriptAnalysisResult> {
  if (!fileContent || fileContent.trim().length === 0) {
    throw new Error('TypeScript file content cannot be empty');
  }

  const llmClient = options?.llmClient || new LLMClient({
    modelRouterUrl: process.env.MODEL_ROUTER_URL || '',
    apiKey: process.env.WHIZURAI_API_KEY ?? '',
  });

  const systemPrompt = `You are a TypeScript expert. Analyze the TypeScript code and extract:

1. **Interfaces and Types**: Extract all interfaces, types, and type aliases that represent data models
2. **React Component Props**: If React components are present, extract prop types
3. **API Client Patterns**: If API client code is present, extract endpoint patterns (fetch calls, axios calls, etc.)
4. **Relationships**: Identify relationships between types (nested objects, arrays, references)

Return a JSON object with this structure:
{
  "entities": [
    {
      "name": "EntityName",
      "schema": {
        "type": "object",
        "properties": {
          "fieldName": {
            "type": "string|number|boolean|array|object",
            "description": "Field description"
          }
        },
        "required": ["field1", "field2"]
      },
      "description": "Entity description"
    }
  ],
  "endpoints": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/resource",
      "description": "Endpoint description",
      "entity": "EntityName"
    }
  ],
  "relationships": [
    {
      "from": "Entity1",
      "to": "Entity2",
      "type": "one-to-many|many-to-one|many-to-many",
      "field": "foreignKeyField"
    }
  ],
  "patterns": [
    {
      "type": "react-component|api-client|type-definition",
      "details": {
        "componentName": "ComponentName",
        "props": [...]
      }
    }
  ]
}

Convert TypeScript types to JSON Schema format. Be thorough in identifying API patterns from fetch/axios calls.`;

  try {
    const response = await llmClient.chatJSON<TypeScriptAnalysisResult>({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fileContent },
      ],
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: 'json_object',
    });

    return validateAnalysisResult(response);
  } catch (error) {
    throw new Error(
      `Failed to analyze TypeScript: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate and normalize analysis result
 */
function validateAnalysisResult(result: unknown): TypeScriptAnalysisResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid response format from LLM');
  }

  const data = result as Record<string, unknown>;

  return {
    entities: Array.isArray(data.entities) ? data.entities as EntitySchema[] : [],
    endpoints: Array.isArray(data.endpoints) ? data.endpoints as EndpointDefinition[] : [],
    relationships: Array.isArray(data.relationships) 
      ? data.relationships as RelationshipDefinition[] 
      : [],
    patterns: Array.isArray(data.patterns) 
      ? data.patterns.map((p: any) => ({
          type: p.type || 'type-definition',
          file: p.file,
          details: p.details || {},
        }))
      : [],
  };
}

