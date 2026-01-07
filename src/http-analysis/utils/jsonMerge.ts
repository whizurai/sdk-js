/**
 * JSON Schema Merging Utilities
 * 
 * Merges multiple JSON samples into a unified JSON Schema representation.
 * Used to infer API endpoint schemas from real traffic.
 * 
 * Features:
 * - Type inference from values
 * - Nullable field detection
 * - Array item schema merging
 * - Nested object merging
 * - Required field detection
 * - Enum detection for repeated string values
 */

/**
 * JSON Schema types
 */
export type JsonSchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'integer';

/**
 * JSON Schema definition (simplified)
 */
export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: any[];
  nullable?: boolean;
  example?: any;
  description?: string;
  // Metadata for tracking
  _observedCount?: number;
  _nullCount?: number;
  _examples?: any[];
}

/**
 * Schema merge options
 */
export interface SchemaMergeOptions {
  /** Maximum number of examples to store per field (default: 5) */
  maxExamples?: number;
  /** Minimum occurrence ratio to mark field as required (default: 0.9) */
  requiredThreshold?: number;
  /** Minimum occurrences to detect enum values (default: 3) */
  enumThreshold?: number;
  /** Maximum enum values to track (default: 10) */
  maxEnumValues?: number;
  /** Whether to infer integer vs number types (default: true) */
  inferIntegerType?: boolean;
}

/**
 * Infer JSON type from a value
 */
function inferType(value: any, inferInteger: boolean = true): JsonSchemaType {
  if (value === null) return 'null';
  if (value === undefined) return 'null';

  const jsType = typeof value;

  if (jsType === 'string') return 'string';
  if (jsType === 'boolean') return 'boolean';
  if (jsType === 'number') {
    if (inferInteger && Number.isInteger(value)) {
      return 'integer';
    }
    return 'number';
  }

  if (Array.isArray(value)) return 'array';
  if (jsType === 'object') return 'object';

  return 'string'; // Fallback
}

/**
 * Merge two schema types
 */
function mergeTypes(
  type1: JsonSchemaType | JsonSchemaType[] | undefined,
  type2: JsonSchemaType | JsonSchemaType[] | undefined
): JsonSchemaType | JsonSchemaType[] {
  if (!type1) return type2 || 'null';
  if (!type2) return type1;

  const types1 = Array.isArray(type1) ? type1 : [type1];
  const types2 = Array.isArray(type2) ? type2 : [type2];

  const merged = Array.from(new Set([...types1, ...types2]));

  // Simplify integer + number → number
  if (merged.includes('integer') && merged.includes('number')) {
    return merged.filter(t => t !== 'integer');
  }

  return merged.length === 1 ? merged[0] : merged;
}

/**
 * Merge two JSON schemas
 */
function mergeSchemas(
  schema1: JsonSchema,
  schema2: JsonSchema,
  options: SchemaMergeOptions
): JsonSchema {
  const merged: JsonSchema = {
    type: mergeTypes(schema1.type, schema2.type),
    _observedCount: (schema1._observedCount || 0) + (schema2._observedCount || 0),
    _nullCount: (schema1._nullCount || 0) + (schema2._nullCount || 0),
  };

  // Merge properties (for objects)
  if (schema1.properties || schema2.properties) {
    const allKeys = new Set([
      ...Object.keys(schema1.properties || {}),
      ...Object.keys(schema2.properties || {}),
    ]);

    merged.properties = {};
    for (const key of allKeys) {
      const prop1 = schema1.properties?.[key];
      const prop2 = schema2.properties?.[key];

      if (prop1 && prop2) {
        merged.properties[key] = mergeSchemas(prop1, prop2, options);
      } else {
        merged.properties[key] = prop1 || prop2!;
      }
    }
  }

  // Merge array items
  if (schema1.items || schema2.items) {
    if (schema1.items && schema2.items) {
      merged.items = mergeSchemas(schema1.items, schema2.items, options);
    } else if (schema1.items) {
      merged.items = schema1.items;
    } else if (schema2.items) {
      merged.items = schema2.items;
    }
  }

  // Merge required fields
  if (schema1.required || schema2.required) {
    const required1 = new Set(schema1.required || []);
    const required2 = new Set(schema2.required || []);
    merged.required = Array.from(new Set([...required1, ...required2]));
  }

  // Merge enums (intersection)
  if (schema1.enum && schema2.enum) {
    const enum1 = new Set(schema1.enum);
    const enum2 = new Set(schema2.enum);
    const intersection = [...enum1].filter(v => enum2.has(v));

    if (intersection.length > 0 && intersection.length <= (options.maxEnumValues || 10)) {
      merged.enum = intersection;
    }
  } else if (schema1.enum || schema2.enum) {
    // Keep enum if only one side has it and it's small enough
    const existingEnum = schema1.enum || schema2.enum;
    if (existingEnum && existingEnum.length <= (options.maxEnumValues || 10)) {
      merged.enum = existingEnum;
    }
  }

  // Merge examples
  const examples1 = schema1._examples || [];
  const examples2 = schema2._examples || [];
  const maxExamples = options.maxExamples || 5;
  merged._examples = [...examples1, ...examples2].slice(0, maxExamples);

  // Set nullable if null was observed
  if (merged._nullCount && merged._nullCount > 0) {
    merged.nullable = true;
  }

  return merged;
}

/**
 * Infer schema from a single JSON value
 */
function inferSchemaFromValue(
  value: any,
  options: SchemaMergeOptions
): JsonSchema {
  const inferInteger = options.inferIntegerType !== false;
  const type = inferType(value, inferInteger);

  const schema: JsonSchema = {
    type,
    _observedCount: 1,
    _nullCount: value === null ? 1 : 0,
    _examples: [value].slice(0, options.maxExamples || 5),
  };

  if (type === 'object' && value !== null) {
    schema.properties = {};
    schema.required = [];

    for (const [key, val] of Object.entries(value)) {
      schema.properties[key] = inferSchemaFromValue(val, options);
      schema.required.push(key);
    }
  } else if (type === 'array' && Array.isArray(value)) {
    if (value.length > 0) {
      // Merge all array item schemas
      let itemSchema = inferSchemaFromValue(value[0], options);
      for (let i = 1; i < value.length; i++) {
        const nextSchema = inferSchemaFromValue(value[i], options);
        itemSchema = mergeSchemas(itemSchema, nextSchema, options);
      }
      schema.items = itemSchema;
    } else {
      schema.items = { type: 'null' };
    }
  }

  return schema;
}

/**
 * Merge multiple JSON samples into a unified schema
 */
export function mergeJsonSamples(
  samples: any[],
  options: SchemaMergeOptions = {}
): JsonSchema {
  if (samples.length === 0) {
    return { type: 'null' };
  }

  // Filter out null/undefined samples
  const validSamples = samples.filter(s => s !== null && s !== undefined);

  if (validSamples.length === 0) {
    return { type: 'null', nullable: true };
  }

  // Start with first sample
  let merged = inferSchemaFromValue(validSamples[0], options);

  // Merge remaining samples
  for (let i = 1; i < validSamples.length; i++) {
    const nextSchema = inferSchemaFromValue(validSamples[i], options);
    merged = mergeSchemas(merged, nextSchema, options);
  }

  // Post-process: determine required fields based on threshold
  if (merged.properties && merged._observedCount) {
    const threshold = options.requiredThreshold || 0.9;
    const required: string[] = [];

    for (const [key, propSchema] of Object.entries(merged.properties)) {
      const observedRatio = (propSchema._observedCount || 0) / merged._observedCount;
      if (observedRatio >= threshold) {
        required.push(key);
      }
    }

    if (required.length > 0) {
      merged.required = required;
    }
  }

  // Clean up metadata fields
  return cleanSchema(merged);
}

/**
 * Remove internal metadata fields from schema
 */
function cleanSchema(schema: JsonSchema): JsonSchema {
  const cleaned: JsonSchema = {};
  
  if (schema.type !== undefined) {
    cleaned.type = schema.type;
  }

  if (schema.properties) {
    cleaned.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      cleaned.properties[key] = cleanSchema(value);
    }
  }

  if (schema.items) {
    cleaned.items = cleanSchema(schema.items);
  }

  if (schema.required && schema.required.length > 0) {
    cleaned.required = schema.required;
  }

  if (schema.enum) {
    cleaned.enum = schema.enum;
  }

  if (schema.nullable) {
    cleaned.nullable = schema.nullable;
  }

  if (schema._examples && schema._examples.length > 0) {
    cleaned.example = schema._examples[0];
  }

  return cleaned;
}

/**
 * Merge request/response bodies into schemas
 * Convenience wrapper for common use case
 */
export function mergeRequestBodies(
  bodies: string[],
  options: SchemaMergeOptions = {}
): JsonSchema | null {
  const parsed: any[] = [];

  for (const body of bodies) {
    if (!body || body.trim() === '') continue;

    try {
      parsed.push(JSON.parse(body));
    } catch (e) {
      // Skip invalid JSON
      continue;
    }
  }

  if (parsed.length === 0) return null;

  return mergeJsonSamples(parsed, options);
}

/**
 * Convert schema to OpenAPI 3.0 format
 */
export function toOpenApiSchema(schema: JsonSchema): any {
  const openApiSchema: any = {};

  if (schema.type) {
    if (Array.isArray(schema.type)) {
      openApiSchema.oneOf = schema.type.map(t => ({ type: t }));
    } else {
      openApiSchema.type = schema.type;
    }
  }

  if (schema.nullable) {
    openApiSchema.nullable = true;
  }

  if (schema.properties) {
    openApiSchema.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      openApiSchema.properties[key] = toOpenApiSchema(value);
    }
  }

  if (schema.items) {
    openApiSchema.items = toOpenApiSchema(schema.items);
  }

  if (schema.required) {
    openApiSchema.required = schema.required;
  }

  if (schema.enum) {
    openApiSchema.enum = schema.enum;
  }

  if (schema.example !== undefined) {
    openApiSchema.example = schema.example;
  }

  if (schema.description) {
    openApiSchema.description = schema.description;
  }

  return openApiSchema;
}
