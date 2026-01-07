/**
 * Type Analyzer Tests
 */

import { analyzeTypeScript } from '../../src/mock/typeAnalyzer';
import { LLMClient } from '../../src/ai/llmClient';

jest.mock('../../src/ai/llmClient');

describe('analyzeTypeScript', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      chatJSON: jest.fn(),
    } as any;
    (LLMClient as jest.Mock).mockImplementation(() => mockLLMClient);
  });

  it('should analyze TypeScript code', async () => {
    const tsCode = `
      interface Product {
        id: string;
        name: string;
        price: number;
      }

      interface User {
        id: string;
        email: string;
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
        {
          name: 'User',
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      ],
      endpoints: [],
      relationships: [],
      patterns: [
        {
          type: 'type-definition',
          details: {},
        },
      ],
    });

    const result = await analyzeTypeScript(tsCode);

    expect(result.entities).toHaveLength(2);
    expect(result.patterns).toHaveLength(1);
    expect(mockLLMClient.chatJSON).toHaveBeenCalled();
  });

  it('should throw error for empty code', async () => {
    await expect(analyzeTypeScript('')).rejects.toThrow(
      'TypeScript file content cannot be empty'
    );
  });

  it('should use provided LLM client', async () => {
    const customClient = {
      chatJSON: jest.fn().mockResolvedValue({
        entities: [],
        endpoints: [],
        relationships: [],
        patterns: [],
      }),
    } as any;

    await analyzeTypeScript('interface Test {}', { llmClient: customClient });

    expect(customClient.chatJSON).toHaveBeenCalled();
    expect(mockLLMClient.chatJSON).not.toHaveBeenCalled();
  });
});

