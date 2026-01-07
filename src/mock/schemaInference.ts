/**
 * Schema Inference
 * 
 * Infers JSON Schema from TypeScript, OpenAPI, or JSON samples
 */

import { LLMClient } from '../ai/llmClient';
import type { EntitySchema, EndpointDefinition, RelationshipDefinition, JSONSchema } from './types';

export interface TypeScriptInferOptions {
  /** LLM client instance (optional) */
  llmClient?: LLMClient;
  /** Use LLM for complex type inference (default: true) */
  useLLM?: boolean;
}

export interface OpenAPIInferOptions {
  /** LLM client instance (optional) */
  llmClient?: LLMClient;
}

export interface JSONInferOptions {
  /** LLM client instance (optional) */
  llmClient?: LLMClient;
  /** Use LLM for better inference (default: true) */
  useLLM?: boolean;
}

export interface SchemaInferenceResult {
  entities: EntitySchema[];
  endpoints: EndpointDefinition[];
  relationships: RelationshipDefinition[];
}

/**
 * Infer schema from TypeScript file content
 */
export async function inferFromTypeScript(
  fileContent: string,
  options?: TypeScriptInferOptions
): Promise<SchemaInferenceResult> {
  if (!fileContent || fileContent.trim().length === 0) {
    throw new Error('TypeScript file content cannot be empty');
  }

  const useLLM = options?.useLLM !== false;

  if (useLLM) {
    // Use LLM to analyze TypeScript and extract schemas
    const llmClient = options?.llmClient || new LLMClient({
      modelRouterUrl: process.env.MODEL_ROUTER_URL || '',
      apiKey: process.env.WHIZURAI_API_KEY ?? '',
    });

    const systemPrompt = `You are a TypeScript expert. Analyze the TypeScript code and extract:
1. Interfaces and types that represent data models
2. REST API endpoint patterns (if any)
3. Relationships between types

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
  ]
}

Convert TypeScript types to JSON Schema format.`;

    try {
      const response = await llmClient.chatJSON<SchemaInferenceResult>({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fileContent },
        ],
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 3000,
        responseFormat: 'json_object',
      });

      return validateSchemaResult(response);
    } catch (error) {
      throw new Error(
        `Failed to infer schema from TypeScript: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } else {
    // Basic parsing without LLM (simplified)
    // This would require TypeScript compiler API - for now, fall back to LLM
    throw new Error('TypeScript parsing without LLM is not yet implemented. Set useLLM=true.');
  }
}

/**
 * Infer schema from OpenAPI specification
 */
export async function inferFromOpenAPI(
  openApiSpec: string | object,
  _options?: OpenAPIInferOptions
): Promise<SchemaInferenceResult> {
  let spec: any;
  
  if (typeof openApiSpec === 'string') {
    try {
      spec = JSON.parse(openApiSpec);
    } catch {
      throw new Error('Invalid OpenAPI spec: must be valid JSON');
    }
  } else {
    spec = openApiSpec;
  }

  if (!spec.openapi && !spec.swagger) {
    throw new Error('Invalid OpenAPI spec: missing openapi or swagger field');
  }

  const entities: EntitySchema[] = [];
  const endpoints: EndpointDefinition[] = [];
  const relationships: RelationshipDefinition[] = [];

  // Extract schemas from components/schemas
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      entities.push({
        name,
        schema: normalizeJSONSchema(schema as Record<string, unknown>),
        description: (schema as any).description,
      });
    }
  }

  // Extract endpoints from paths
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const pathObj = pathItem as any;
      
      for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        if (pathObj[method]) {
          const operation = pathObj[method];
          const entityName = extractEntityNameFromPath(path);
          
          endpoints.push({
            method: method.toUpperCase(),
            path: normalizePath(path),
            description: operation.summary || operation.description,
            entity: entityName,
          });
        }
      }
    }
  }

  // Extract relationships from schema references
  for (const entity of entities) {
    const refs = findReferences(entity.schema);
    for (const ref of refs) {
      const refEntity = entities.find(e => e.name === ref);
      if (refEntity) {
        relationships.push({
          from: entity.name,
          to: ref,
          type: 'many-to-one',
        });
      }
    }
  }

  return {
    entities,
    endpoints,
    relationships,
  };
}

/**
 * Infer schema from JSON sample
 */
export async function inferFromJSON(
  jsonSample: string | object,
  options?: JSONInferOptions
): Promise<SchemaInferenceResult> {
  let data: any;
  
  if (typeof jsonSample === 'string') {
    try {
      data = JSON.parse(jsonSample);
    } catch {
      throw new Error('Invalid JSON sample: must be valid JSON');
    }
  } else {
    data = jsonSample;
  }

  const useLLM = options?.useLLM !== false;

  if (useLLM) {
    // Use LLM to infer schema from JSON sample
    const llmClient = options?.llmClient || new LLMClient({
      modelRouterUrl: process.env.MODEL_ROUTER_URL || '',
      apiKey: process.env.WHIZURAI_API_KEY ?? '',
    });

    const systemPrompt = `You are a JSON Schema expert. Analyze the JSON sample and infer:
1. A JSON Schema that describes the structure
2. Appropriate entity name
3. Standard REST endpoints for this entity
4. Relationships if the JSON contains nested objects or arrays

Return a JSON object with this structure:
{
  "entities": [
    {
      "name": "EntityName",
      "schema": {
        "type": "object",
        "properties": {...},
        "required": [...]
      },
      "description": "Entity description"
    }
  ],
  "endpoints": [
    {
      "method": "GET",
      "path": "/entity",
      "description": "List all entities"
    }
  ],
  "relationships": []
}`;

    try {
      const response = await llmClient.chatJSON<SchemaInferenceResult>({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(data, null, 2) },
        ],
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        maxTokens: 2000,
        responseFormat: 'json_object',
      });

      return validateSchemaResult(response);
    } catch (error) {
      throw new Error(
        `Failed to infer schema from JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } else {
    // Basic inference without LLM
    const schema = inferJSONSchema(data);
    const entityName = inferEntityName(data);
    
    return {
      entities: [{
        name: entityName,
        schema,
        description: `Inferred from JSON sample`,
      }],
      endpoints: generateDefaultEndpoints(entityName),
      relationships: [],
    };
  }
}

/**
 * Validate and normalize schema inference result
 */
function validateSchemaResult(result: unknown): SchemaInferenceResult {
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
  };
}

/**
 * Normalize JSON Schema (ensure it's in correct format)
 */
function normalizeJSONSchema(schema: Record<string, unknown>): JSONSchema {
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    return { type: 'object', description: `Reference to ${schema.$ref}`, $ref: schema.$ref };
  }

  const normalized: JSONSchema = {
    type: typeof schema.type === 'string' || Array.isArray(schema.type) ? (schema.type as string | string[]) : 'object',
  };

  const properties = schema.properties as Record<string, JSONSchema> | undefined;
  if (properties) {
    normalized.properties = properties;
  }

  const required = schema.required as string[] | undefined;
  if (required) {
    normalized.required = required;
  }

  if (schema.enum) {
    normalized.enum = schema.enum as unknown[];
  }
  if (typeof schema.format === 'string') {
    normalized.format = schema.format;
  }
  if (typeof schema.description === 'string') {
    normalized.description = schema.description;
  }
  if ('example' in schema) {
    normalized.example = schema.example;
  }
  if ('default' in schema) {
    normalized.default = schema.default;
  }
  if (schema.items) {
    normalized.items = normalizeJSONSchema(schema.items as Record<string, unknown>);
  }

  return normalized;
}

/**
 * Extract entity name from OpenAPI path
 */
function extractEntityNameFromPath(path: string): string {
  // Extract first path segment (e.g., /users -> users)
  const segments = path.split('/').filter(s => s && !s.startsWith('{'));
  return segments[0] || 'Resource';
}

/**
 * Normalize OpenAPI path to standard format
 */
function normalizePath(path: string): string {
  // Convert {id} to :id
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

/**
 * Find schema references in a JSON Schema
 */
function findReferences(schema: JSONSchema, refs: string[] = []): string[] {
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      if (prop.$ref) {
        const refName = prop.$ref.split('/').pop();
        if (refName && !refs.includes(refName)) {
          refs.push(refName);
        }
      }
      if (prop.properties || prop.items) {
        findReferences(prop, refs);
      }
    }
  }
  if (schema.items) {
    findReferences(schema.items, refs);
  }
  return refs;
}

/**
 * Infer JSON Schema from a JSON object
 */
function inferJSONSchema(data: any): JSONSchema {
  if (data === null) {
    return { type: 'null' };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { type: 'array', items: { type: 'object' } };
    }
    return {
      type: 'array',
      items: inferJSONSchema(data[0]),
    };
  }

  if (typeof data === 'object') {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      properties[key] = inferJSONSchema(value);
      if (value !== null && value !== undefined) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return {
    type: typeof data as 'string' | 'number' | 'boolean',
  };
}

/**
 * Infer entity name from JSON data
 */
function inferEntityName(data: any): string {
  if (Array.isArray(data) && data.length > 0) {
    return inferEntityName(data[0]);
  }
  
  if (typeof data === 'object' && data !== null) {
    // Try to find a name field
    if (data.name) {
      return typeof data.name === 'string' ? data.name : 'Resource';
    }
    if (data.title) {
      return typeof data.title === 'string' ? data.title : 'Resource';
    }
  }
  
  return 'Resource';
}

/**
 * Generate default REST endpoints for an entity
 */
function generateDefaultEndpoints(entityName: string): EndpointDefinition[] {
  const resource = entityName.toLowerCase();
  
  return [
    { method: 'GET', path: `/${resource}`, description: `List all ${entityName}`, entity: entityName },
    { method: 'GET', path: `/${resource}/:id`, description: `Get ${entityName} by ID`, entity: entityName },
    { method: 'POST', path: `/${resource}`, description: `Create new ${entityName}`, entity: entityName },
    { method: 'PUT', path: `/${resource}/:id`, description: `Update ${entityName}`, entity: entityName },
    { method: 'DELETE', path: `/${resource}/:id`, description: `Delete ${entityName}`, entity: entityName },
  ];
}

