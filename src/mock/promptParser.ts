/**
 * Prompt Parser
 * 
 * Parses natural language prompts and extracts API structure using LLM.
 */

import { LLMClient } from '../ai/llmClient';
import type {
  EntityDefinition,
  RelationshipDefinition,
  EndpointDefinition,
  OperationDefinition,
} from './types';

export interface PromptParseOptions {
  /** LLM model to use (default: 'gpt-4') */
  model?: string;
  /** Temperature for generation (default: 0.7) */
  temperature?: number;
  /** Maximum tokens (default: 2000) */
  maxTokens?: number;
  /** LLM client instance (optional, will create if not provided) */
  llmClient?: LLMClient;
}

export interface PromptParseResult {
  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
  endpoints: EndpointDefinition[];
  operations: OperationDefinition[];
}

/**
 * Parse a natural language prompt and extract API structure
 */
export async function parsePrompt(
  prompt: string,
  options?: PromptParseOptions
): Promise<PromptParseResult> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt cannot be empty');
  }

  const model = options?.model || 'gpt-4';
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens || 2000;

  // Create LLM client if not provided
  const llmClient = options?.llmClient || new LLMClient({
    modelRouterUrl: process.env.MODEL_ROUTER_URL || '',
    apiKey: process.env.WHIZURAI_API_KEY ?? '',
  });

  // Construct system prompt for structured extraction
  const systemPrompt = `You are an API design expert. Analyze the user's prompt and extract:
1. Entities (data models) with their fields and types
2. Relationships between entities (one-to-many, many-to-one, many-to-many)
3. REST API endpoints (GET, POST, PUT, DELETE)
4. CRUD operations for each entity

Return a JSON object with this structure:
{
  "entities": [
    {
      "name": "EntityName",
      "description": "Description",
      "fields": [
        {
          "name": "fieldName",
          "type": "string|number|boolean|date|image",
          "description": "Field description",
          "required": true
        }
      ]
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
  "endpoints": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/resource",
      "description": "Endpoint description",
      "entity": "EntityName"
    }
  ],
  "operations": [
    {
      "type": "list|get|create|update|delete",
      "endpoint": {
        "method": "GET",
        "path": "/resource",
        "description": "List all resources"
      }
    }
  ]
}

Be thorough and include all standard REST endpoints for each entity.`;

  try {
    const response = await llmClient.chatJSON<PromptParseResult>({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      model,
      temperature,
      maxTokens,
      responseFormat: 'json_object',
    });

    // Validate and normalize the response
    return validateAndNormalizeResult(response);
  } catch (error) {
    throw new Error(
      `Failed to parse prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate and normalize the LLM response
 */
function validateAndNormalizeResult(result: unknown): PromptParseResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid response format from LLM');
  }

  const data = result as Record<string, unknown>;

  return {
    entities: Array.isArray(data.entities) ? data.entities as EntityDefinition[] : [],
    relationships: Array.isArray(data.relationships) 
      ? data.relationships as RelationshipDefinition[] 
      : [],
    endpoints: Array.isArray(data.endpoints) 
      ? data.endpoints as EndpointDefinition[] 
      : [],
    operations: Array.isArray(data.operations) 
      ? data.operations as OperationDefinition[] 
      : [],
  };
}

