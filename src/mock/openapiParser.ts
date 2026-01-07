/**
 * OpenAPI Parser
 * 
 * Parses OpenAPI 3.0 specifications and extracts schemas and endpoints
 */

import type { EntitySchema, EndpointDefinition, RelationshipDefinition, JSONSchema } from './types';

export interface OpenAPIParseResult {
  entities: EntitySchema[];
  endpoints: EndpointDefinition[];
  relationships: RelationshipDefinition[];
  /** OpenAPI version */
  version: string;
  /** API title */
  title?: string;
  /** API description */
  description?: string;
}

/**
 * Parse OpenAPI 3.0 specification
 */
export function parseOpenAPI(spec: string | object): OpenAPIParseResult {
  let openApiSpec: any;
  
  if (typeof spec === 'string') {
    try {
      openApiSpec = JSON.parse(spec);
    } catch {
      throw new Error('Invalid OpenAPI spec: must be valid JSON');
    }
  } else {
    openApiSpec = spec;
  }

  if (!openApiSpec.openapi && !openApiSpec.swagger) {
    throw new Error('Invalid OpenAPI spec: missing openapi or swagger field');
  }

  const version = openApiSpec.openapi || openApiSpec.swagger;
  const info = openApiSpec.info || {};
  const title = info.title;
  const description = info.description;

  const entities: EntitySchema[] = [];
  const endpoints: EndpointDefinition[] = [];
  const relationships: RelationshipDefinition[] = [];

  // Extract schemas from components/schemas
  if (openApiSpec.components?.schemas) {
    for (const [name, schema] of Object.entries(openApiSpec.components.schemas)) {
      entities.push({
        name,
        schema: normalizeJSONSchema(schema as any),
        description: (schema as any).description,
      });
    }
  }

  // Extract endpoints from paths
  if (openApiSpec.paths) {
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      const pathObj = pathItem as any;
      
      for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']) {
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
        // Check if relationship already exists
        const exists = relationships.some(
          r => r.from === entity.name && r.to === ref
        );
        if (!exists) {
          relationships.push({
            from: entity.name,
            to: ref,
            type: 'many-to-one',
          });
        }
      }
    }
  }

  return {
    entities,
    endpoints,
    relationships,
    version,
    title,
    description,
  };
}

/**
 * Normalize JSON Schema (ensure it's in correct format)
 */
function normalizeJSONSchema(schema: any): JSONSchema {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return {
      type: 'object',
      description: `Reference to ${refName}`,
      $ref: schema.$ref,
    };
  }

  if (schema.allOf) {
    const merged: JSONSchema = { type: 'object' };
    for (const subSchema of schema.allOf) {
      const normalized = normalizeJSONSchema(subSchema);
      if (normalized.properties) {
        merged.properties = { ...(merged.properties ?? {}), ...normalized.properties };
      }
      if (normalized.required) {
        merged.required = [...(merged.required ?? []), ...normalized.required];
      }
    }
    return merged;
  }

  if (schema.anyOf || schema.oneOf) {
    const firstOption = (schema.anyOf || schema.oneOf)[0];
    return normalizeJSONSchema(firstOption);
  }

  const normalized: JSONSchema = {
    type: schema.type || 'object',
  };

  if (schema.properties) {
    normalized.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, normalizeJSONSchema(value as any)])
    );
  }
  if (schema.required) {
    normalized.required = schema.required;
  }
  if (schema.items) {
    normalized.items = normalizeJSONSchema(schema.items);
  }
  if (schema.enum) {
    normalized.enum = schema.enum;
  }
  if (schema.format) {
    normalized.format = schema.format;
  }
  if (schema.description) {
    normalized.description = schema.description;
  }
  if ('example' in schema) {
    normalized.example = schema.example;
  }
  if ('default' in schema) {
    normalized.default = schema.default;
  }
  if (schema.minimum !== undefined) {
    normalized.minimum = schema.minimum;
  }
  if (schema.maximum !== undefined) {
    normalized.maximum = schema.maximum;
  }
  if (schema.minLength !== undefined) {
    normalized.minLength = schema.minLength;
  }
  if (schema.maxLength !== undefined) {
    normalized.maxLength = schema.maxLength;
  }
  if (schema.pattern) {
    normalized.pattern = schema.pattern;
  }

  return normalized;
}

/**
 * Extract entity name from OpenAPI path
 */
function extractEntityNameFromPath(path: string): string {
  // Extract first path segment (e.g., /users -> users, /api/v1/products -> products)
  const segments = path.split('/').filter(s => s && !s.startsWith('{') && s !== 'api' && !s.match(/^v\d+$/));
  const entityName = segments[0] || 'Resource';
  
  // Capitalize first letter
  return entityName.charAt(0).toUpperCase() + entityName.slice(1);
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
  // Check for $ref in the schema itself (stored in description for now)
  const schemaAny = schema as any;
  if (schemaAny.$ref) {
    const refName = schemaAny.$ref.split('/').pop();
    if (refName && !refs.includes(refName)) {
      refs.push(refName);
    }
  }

  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      const propAny = prop as any;
      if (propAny.$ref) {
        const refName = propAny.$ref.split('/').pop();
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

