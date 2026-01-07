/**
 * Schema Inference Tests
 */

import {
  inferFromTypeScript,
  inferFromOpenAPI,
  inferFromJSON,
} from '../../src/mock/schemaInference';
import { LLMClient } from '../../src/ai/llmClient';

jest.mock('../../src/ai/llmClient');

describe('inferFromOpenAPI', () => {
  it('should parse OpenAPI spec successfully', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', description: 'Test' },
      components: {
        schemas: {
          Product: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
        },
      },
      paths: {
        '/products': {
          get: {
            summary: 'List products',
            responses: { '200': { description: 'Success' } },
          },
        },
      },
    };

    const result = await inferFromOpenAPI(spec);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Product');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].path).toBe('/products');
  });

  it('should handle invalid OpenAPI spec', async () => {
    await expect(inferFromOpenAPI({})).rejects.toThrow(
      'Invalid OpenAPI spec: missing openapi or swagger field'
    );
  });

  it('should extract relationships from references', async () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Post: {
            type: 'object',
            properties: {
              author: { $ref: '#/components/schemas/User' },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
      paths: {},
    };

    const result = await inferFromOpenAPI(spec);

    expect(result.entities).toHaveLength(2);
    expect(result.relationships.length).toBeGreaterThan(0);
  });
});

describe('inferFromJSON', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      chatJSON: jest.fn(),
    } as any;
    (LLMClient as jest.Mock).mockImplementation(() => mockLLMClient);
  });

  it('should infer schema from JSON sample with LLM', async () => {
    const jsonSample = {
      id: '1',
      name: 'Test Product',
      price: 99.99,
    };

    mockLLMClient.chatJSON.mockResolvedValue({
      entities: [
        {
          name: 'Product',
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'number' },
            },
            required: ['id', 'name', 'price'],
          },
        },
      ],
      endpoints: [],
      relationships: [],
    });

    const result = await inferFromJSON(jsonSample);

    expect(result.entities).toHaveLength(1);
    expect(mockLLMClient.chatJSON).toHaveBeenCalled();
  });

  it('should infer schema without LLM', async () => {
    const jsonSample = { id: '1', name: 'Test' };

    const result = await inferFromJSON(jsonSample, { useLLM: false });

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].schema.type).toBe('object');
  });

  it('should handle invalid JSON', async () => {
    await expect(inferFromJSON('invalid json')).rejects.toThrow(
      'Invalid JSON sample: must be valid JSON'
    );
  });
});

describe('inferFromTypeScript', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      chatJSON: jest.fn(),
    } as any;
    (LLMClient as jest.Mock).mockImplementation(() => mockLLMClient);
  });

  it('should infer schema from TypeScript', async () => {
    const tsCode = `
      interface Product {
        id: string;
        name: string;
        price: number;
      }
    `;

    mockLLMClient.chatJSON.mockResolvedValue({
      entities: [
        {
          name: 'Product',
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'number' },
            },
          },
        },
      ],
      endpoints: [],
      relationships: [],
    });

    const result = await inferFromTypeScript(tsCode);

    expect(result.entities).toHaveLength(1);
    expect(mockLLMClient.chatJSON).toHaveBeenCalled();
  });

  it('should throw error for empty TypeScript', async () => {
    await expect(inferFromTypeScript('')).rejects.toThrow(
      'TypeScript file content cannot be empty'
    );
  });
});

