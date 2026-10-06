/**
 * Data Generator Tests
 */

import { generateData } from '../../src/mock/dataGenerator';
import { ImageClient } from '../../src/ai/imageClient';
import { ContentClient } from '../../src/ai/contentClient';
import type { EntitySchema } from '../../src/mock/types';

jest.mock('../../src/ai/imageClient');
jest.mock('../../src/ai/contentClient');

describe('generateData', () => {
  let mockImageClient: jest.Mocked<ImageClient>;
  let mockContentClient: jest.Mocked<ContentClient>;

  const testSchema: EntitySchema = {
    name: 'Product',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' },
        description: { type: 'string' },
      },
      required: ['id', 'name'],
    },
  };

  beforeEach(() => {
    mockImageClient = {
      generate: jest.fn(),
    } as any;
    mockContentClient = {
      generate: jest.fn(),
    } as any;
    (ImageClient as jest.Mock).mockImplementation(() => mockImageClient);
    (ContentClient as jest.Mock).mockImplementation(() => mockContentClient);
  });

  it('should generate data for a schema', async () => {
    const result = await generateData(testSchema, 3);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('name');
  });

  it('should throw error for invalid count', async () => {
    await expect(generateData(testSchema, 0)).rejects.toThrow(
      'Count must be greater than 0'
    );
    await expect(generateData(testSchema, -1)).rejects.toThrow(
      'Count must be greater than 0'
    );
  });

  it('should generate images when includeImages is true', async () => {
    mockImageClient.generate.mockResolvedValue({
      images: [{ url: 'https://example.com/image.jpg' }],
      model: 'dall-e-3',
      costCents: 4,
      createdAt: new Date().toISOString(),
      cacheHit: false,
    });

    const schemaWithImage: EntitySchema = {
      name: 'Product',
      schema: {
        type: 'object',
        properties: {
          image: { type: 'string', format: 'image' },
        },
        // Required: optional fields are omitted at random (20%), which made
        // this test fail about one run in five.
        required: ['image'],
      },
    };

    const result = await generateData(schemaWithImage, 1, {
      includeImages: true,
    });

    expect(result[0].image).toBeDefined();
  });

  it('should generate content when includeContent is true', async () => {
    mockContentClient.generate.mockResolvedValue({
      items: ['Generated description'],
      model: 'gpt-3.5-turbo',
      costCents: 1,
      createdAt: new Date().toISOString(),
      cacheHit: false,
    });

    const schemaWithDescription: EntitySchema = {
      name: 'Product',
      schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
        },
        // Required for the same reason as the image test: optional fields
        // are omitted at random.
        required: ['description'],
      },
    };

    const result = await generateData(schemaWithDescription, 1, {
      includeContent: true,
    });

    expect(result[0].description).toBeDefined();
  });

  it('should handle optional fields', async () => {
    const schemaWithOptional: EntitySchema = {
      name: 'Product',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          optionalField: { type: 'string' },
        },
        required: ['id'],
      },
    };

    // Optional fields are dropped when Math.random() < 0.2. Alternate below and
    // above that threshold so the assertion is deterministic.
    let call = 0;
    const random = jest
      .spyOn(Math, 'random')
      .mockImplementation(() => (call++ % 2 === 0 ? 0.1 : 0.9));
    const result = await generateData(schemaWithOptional, 10);
    random.mockRestore();

    // Some records should have optionalField, some shouldn't
    const withOptional = result.filter(r => r.optionalField !== undefined);
    expect(withOptional.length).toBeGreaterThan(0);
    expect(withOptional.length).toBeLessThan(10);
  });

  it('should add timestamps', async () => {
    const result = await generateData(testSchema, 1);

    expect(result[0].createdAt).toBeDefined();
    expect(result[0].updatedAt).toBeDefined();
  });
});

