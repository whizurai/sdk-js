/**
 * Data Generator
 * 
 * Generates realistic mock data based on schemas with AI integration
 */

import { ImageClient } from '../ai/imageClient';
import { ContentClient } from '../ai/contentClient';
import type { EntitySchema, JSONSchema } from './types';

export interface DataGenerationOptions {
  /** Include AI-generated images for image fields (default: true) */
  includeImages?: boolean;
  /** Include AI-generated content for text fields (default: true) */
  includeContent?: boolean;
  /** Image client instance (optional) */
  imageClient?: ImageClient;
  /** Content client instance (optional) */
  contentClient?: ContentClient;
  /** Seed for reproducible generation */
  seed?: number;
}

export type GeneratedData = Record<string, unknown>;

/**
 * Generate realistic mock data based on entity schema
 */
export async function generateData(
  schema: EntitySchema,
  count: number,
  options?: DataGenerationOptions
): Promise<GeneratedData[]> {
  if (count <= 0) {
    throw new Error('Count must be greater than 0');
  }

  const includeImages = options?.includeImages !== false;
  const includeContent = options?.includeContent !== false;

  // Create clients if not provided
  const imageClient = options?.imageClient ?? (includeImages
    ? new ImageClient({
        imageServiceUrl: process.env.IMAGE_SERVICE_URL || '',
        apiKey: process.env.WHIZURAI_API_KEY ?? '',
      })
    : undefined);

  const contentClient = options?.contentClient ?? (includeContent
    ? new ContentClient({
        generativeServiceUrl: process.env.GENERATIVE_SERVICE_URL || '',
        apiKey: process.env.WHIZURAI_API_KEY ?? '',
      })
    : undefined);

  const recordOptions: {
    includeImages: boolean;
    includeContent: boolean;
    imageClient?: ImageClient;
    contentClient?: ContentClient;
    seed?: number;
  } = {
    includeImages,
    includeContent,
    ...(imageClient ? { imageClient } : {}),
    ...(contentClient ? { contentClient } : {}),
    ...(typeof options?.seed === 'number' ? { seed: options.seed } : {}),
  };

  const results: GeneratedData[] = [];

  for (let i = 0; i < count; i++) {
    const data = await generateSingleRecord(schema, i, recordOptions);
    results.push(data);
  }

  return results;
}

/**
 * Generate a single record
 */
async function generateSingleRecord(
  schema: EntitySchema,
  index: number,
  options: {
    includeImages: boolean;
    includeContent: boolean;
    imageClient?: ImageClient;
    contentClient?: ContentClient;
    seed?: number;
  }
): Promise<GeneratedData> {
  const data: GeneratedData = {};
  const jsonSchema = schema.schema;

  if (jsonSchema.type !== 'object' || !jsonSchema.properties) {
    throw new Error('Schema must be an object type with properties');
  }

  for (const [fieldName, fieldSchema] of Object.entries(jsonSchema.properties)) {
    const isRequired = jsonSchema.required?.includes(fieldName) || false;
    
    // Skip optional fields randomly (20% chance)
    if (!isRequired && Math.random() < 0.2) {
      continue;
    }

    data[fieldName] = await generateFieldValue(
      fieldName,
      fieldSchema,
      index,
      options
    );
  }

  // Add ID if not present
  if (!data.id) {
    data.id = generateId(schema.name, index);
  }

  // Add timestamps if not present
  if (!data.createdAt && !data.created_at) {
    data.createdAt = generateTimestamp(index);
  }
  if (!data.updatedAt && !data.updated_at) {
    data.updatedAt = generateTimestamp(index);
  }

  return data;
}

/**
 * Generate value for a single field
 */
async function generateFieldValue(
  fieldName: string,
  fieldSchema: JSONSchema,
  index: number,
  options: {
    includeImages: boolean;
    includeContent: boolean;
    imageClient?: ImageClient;
    contentClient?: ContentClient;
    seed?: number;
  }
): Promise<unknown> {
  const type = Array.isArray(fieldSchema.type) 
    ? fieldSchema.type[0] 
    : fieldSchema.type;

  // Check for format hints
  const format = fieldSchema.format || inferFormatFromName(fieldName);

  // Handle image fields
  if (format === 'image' || fieldName.toLowerCase().includes('image') || fieldName.toLowerCase().includes('photo') || fieldName.toLowerCase().includes('avatar')) {
    if (options.includeImages && options.imageClient) {
      try {
        const imageResponse = await options.imageClient.generate({
          prompt: `A realistic ${fieldName} image`,
          model: 'dall-e-3',
          size: '1024x1024',
        });
        if (imageResponse.images.length > 0) {
          return imageResponse.images[0].url;
        }
      } catch (error) {
        // Fall back to placeholder URL
        console.warn(`Failed to generate image for ${fieldName}:`, error);
      }
    }
    return `https://via.placeholder.com/400?text=${encodeURIComponent(fieldName)}`;
  }

  // Handle different types
  switch (type) {
    case 'string':
      return await generateStringValue(fieldName, fieldSchema, format, index, options);
    
    case 'number':
    case 'integer':
      return generateNumberValue(fieldSchema, index);
    
    case 'boolean':
      return Math.random() > 0.5;
    
    case 'array':
      return generateArrayValue(fieldSchema, index, options);
    
    case 'object':
      return generateObjectValue(fieldSchema, index, options);
    
    case 'null':
      return null;
    
    default:
      return generateStringValue(fieldName, fieldSchema, format, index, options);
  }
}

/**
 * Generate string value
 */
async function generateStringValue(
  fieldName: string,
  fieldSchema: JSONSchema,
  format: string | undefined,
  index: number,
  options: {
    includeContent: boolean;
    contentClient?: ContentClient;
  }
): Promise<string> {
  // Handle enum
  if (fieldSchema.enum && fieldSchema.enum.length > 0) {
    return String(fieldSchema.enum[index % fieldSchema.enum.length]);
  }

  // Handle format-specific generation
  switch (format) {
    case 'email':
      return `user${index}@example.com`;
    
    case 'uri':
    case 'url':
      return `https://example.com/resource/${index}`;
    
    case 'date':
      return generateDate(index);
    
    case 'date-time':
      return generateDateTime(index);
    
    case 'uuid':
      return generateUUID(index);
    
    default:
      // Use AI content generation for descriptive fields
      if (options.includeContent && options.contentClient) {
        const descriptiveFields = ['description', 'title', 'name', 'content', 'summary', 'bio'];
        if (descriptiveFields.some(df => fieldName.toLowerCase().includes(df))) {
          try {
            const contentType = inferContentType(fieldName);
            const response = await options.contentClient.generate({
              type: contentType,
              context: fieldName,
              count: 1,
            });
            if (response.items.length > 0) {
              return response.items[0];
            }
          } catch (error) {
            console.warn(`Failed to generate content for ${fieldName}:`, error);
          }
        }
      }
      
      // Fall back to realistic placeholder
      return generateRealisticString(fieldName, index);
  }
}

/**
 * Generate number value
 */
function generateNumberValue(fieldSchema: JSONSchema, index: number): number {
  // Use example if provided
  if (fieldSchema.example !== undefined && typeof fieldSchema.example === 'number') {
    return fieldSchema.example + index;
  }

  // Generate realistic number based on field name
  const baseValue = 100 + (index * 10);
  
  // Add some randomness
  const variation = Math.floor(Math.random() * 50);
  return baseValue + variation;
}

/**
 * Generate array value
 */
async function generateArrayValue(
  fieldSchema: JSONSchema,
  index: number,
  options: any
): Promise<unknown[]> {
  if (!fieldSchema.items) {
    return [];
  }

  const length = Math.floor(Math.random() * 5) + 1; // 1-5 items
  const items: unknown[] = [];

  for (let i = 0; i < length; i++) {
    const item = await generateFieldValue('item', fieldSchema.items, index * 100 + i, options);
    items.push(item);
  }

  return items;
}

/**
 * Generate object value
 */
async function generateObjectValue(
  fieldSchema: JSONSchema,
  index: number,
  options: any
): Promise<Record<string, unknown>> {
  if (!fieldSchema.properties) {
    return {};
  }

  const obj: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fieldSchema.properties)) {
    obj[key] = await generateFieldValue(key, value, index, options);
  }

  return obj;
}

/**
 * Infer format from field name
 */
function inferFormatFromName(fieldName: string): string | undefined {
  const lower = fieldName.toLowerCase();
  
  if (lower.includes('email')) return 'email';
  if (lower.includes('url') || lower.includes('uri') || lower.includes('link')) return 'url';
  if (lower.includes('date') && !lower.includes('time')) return 'date';
  if (lower.includes('date') && lower.includes('time')) return 'date-time';
  if (lower.includes('uuid') || lower.includes('id') && lower.includes('uuid')) return 'uuid';
  if (lower.includes('image') || lower.includes('photo') || lower.includes('avatar')) return 'image';
  
  return undefined;
}

/**
 * Infer content type from field name
 */
function inferContentType(fieldName: string): 'title' | 'description' | 'text' | 'name' | 'custom' {
  const lower = fieldName.toLowerCase();
  
  if (lower.includes('title') || lower.includes('name')) return 'title';
  if (lower.includes('description') || lower.includes('summary') || lower.includes('bio')) return 'description';
  if (lower.includes('content') || lower.includes('body')) return 'text';
  if (lower.includes('name') && !lower.includes('description')) return 'name';
  
  return 'custom';
}

/**
 * Generate realistic string
 */
function generateRealisticString(fieldName: string, index: number): string {
  const lower = fieldName.toLowerCase();
  
  if (lower.includes('name')) {
    return `Item ${index + 1}`;
  }
  if (lower.includes('title')) {
    return `Sample Title ${index + 1}`;
  }
  if (lower.includes('description')) {
    return `This is a sample description for item ${index + 1}.`;
  }
  
  return `value-${index}`;
}

/**
 * Generate ID
 */
function generateId(entityName: string, index: number): string {
  const prefix = entityName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${prefix}_${index + 1}`;
}

/**
 * Generate timestamp
 */
function generateTimestamp(index: number): string {
  const now = new Date();
  const daysAgo = index % 30; // Spread over last 30 days
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

/**
 * Generate date
 */
function generateDate(index: number): string {
  const now = new Date();
  const daysAgo = index % 365;
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Generate date-time
 */
function generateDateTime(index: number): string {
  return generateTimestamp(index);
}

/**
 * Generate UUID
 */
function generateUUID(index: number): string {
  // Simple UUID-like string (not cryptographically secure, but good enough for mocks)
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const randomBytes = () => {
    const bytes = [];
    for (let i = 0; i < 16; i++) {
      bytes.push(Math.floor(Math.random() * 256));
    }
    return bytes;
  };
  
  const bytes = randomBytes();
  bytes[0] = (bytes[0] + (index & 0xff)) & 0xff;
  bytes[1] = (bytes[1] + ((index >> 8) & 0xff)) & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
  
  return [
    hex(bytes[0]) + hex(bytes[1]) + hex(bytes[2]) + hex(bytes[3]),
    hex(bytes[4]) + hex(bytes[5]),
    hex(bytes[6]) + hex(bytes[7]),
    hex(bytes[8]) + hex(bytes[9]),
    hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15]),
  ].join('-');
}

