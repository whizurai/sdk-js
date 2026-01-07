/**
 * OpenAPI Parser Tests
 */

import { parseOpenAPI } from '../../src/mock/openapiParser';

describe('parseOpenAPI', () => {
  it('should parse OpenAPI 3.0 spec', () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        description: 'A test API',
      },
      components: {
        schemas: {
          Product: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
      paths: {
        '/products': {
          get: {
            summary: 'List products',
            responses: { '200': { description: 'Success' } },
          },
          post: {
            summary: 'Create product',
            responses: { '201': { description: 'Created' } },
          },
        },
        '/products/{id}': {
          get: {
            summary: 'Get product',
            responses: { '200': { description: 'Success' } },
          },
        },
      },
    };

    const result = parseOpenAPI(spec);

    expect(result.version).toBe('3.0.0');
    expect(result.title).toBe('Test API');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Product');
    expect(result.endpoints.length).toBeGreaterThanOrEqual(3);
    expect(result.endpoints[0].path).toBe('/products');
    expect(result.endpoints.find(e => e.path === '/products/:id')).toBeDefined();
  });

  it('should handle Swagger 2.0 spec', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Test API' },
      paths: {},
    };

    const result = parseOpenAPI(spec);

    expect(result.version).toBe('2.0');
  });

  it('should extract relationships from $ref', () => {
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

    const result = parseOpenAPI(spec);

    expect(result.entities).toHaveLength(2);
    expect(result.relationships.length).toBeGreaterThan(0);
  });

  it('should handle invalid spec', () => {
    expect(() => parseOpenAPI({})).toThrow(
      'Invalid OpenAPI spec: missing openapi or swagger field'
    );
  });

  it('should handle string input', () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      paths: {},
    });

    const result = parseOpenAPI(spec);

    expect(result.version).toBe('3.0.0');
  });

  it('should handle invalid JSON string', () => {
    expect(() => parseOpenAPI('invalid json')).toThrow(
      'Invalid OpenAPI spec: must be valid JSON'
    );
  });
});

