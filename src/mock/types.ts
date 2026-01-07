/**
 * Type definitions for Mock API Builder
 */

/**
 * Entity definition extracted from prompts or schemas
 */
export interface EntityDefinition {
  name: string;
  description: string;
  fields: FieldDefinition[];
}

/**
 * Field definition within an entity
 */
export interface FieldDefinition {
  name: string;
  type: string; // string, number, boolean, date, image, etc.
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
}

/**
 * Relationship between entities
 */
export interface RelationshipDefinition {
  from: string; // Entity name
  to: string; // Entity name
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  field?: string; // Foreign key field name
}

/**
 * API endpoint definition
 */
export interface EndpointDefinition {
  method: string; // GET, POST, PUT, DELETE, PATCH
  path: string; // /products, /products/:id
  description?: string;
  entity?: string; // Related entity name
}

/**
 * Operation definition (CRUD operations)
 */
export interface OperationDefinition {
  type: 'list' | 'get' | 'create' | 'update' | 'delete';
  endpoint: EndpointDefinition;
}

/**
 * Entity schema (JSON Schema format)
 */
export interface EntitySchema {
  name: string;
  schema: JSONSchema; // JSON Schema format
  description?: string;
}

/**
 * JSON Schema type (simplified)
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  format?: string;
  description?: string;
  example?: unknown;
  default?: unknown;
  $ref?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

