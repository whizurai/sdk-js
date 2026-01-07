/**
 * Prompt Parser Tests
 */

import { parsePrompt } from '../../src/mock/promptParser';
import { LLMClient } from '../../src/ai/llmClient';

// Mock LLMClient
jest.mock('../../src/ai/llmClient');

describe('parsePrompt', () => {
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      chatJSON: jest.fn(),
    } as any;
    (LLMClient as jest.Mock).mockImplementation(() => mockLLMClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should parse a simple prompt successfully', async () => {
    const mockResponse = {
      entities: [
        {
          name: 'Product',
          description: 'A product entity',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
          ],
        },
      ],
      relationships: [],
      endpoints: [
        { method: 'GET', path: '/products', description: 'List products' },
      ],
      operations: [
        { type: 'list', endpoint: { method: 'GET', path: '/products' } },
      ],
    };

    mockLLMClient.chatJSON.mockResolvedValue(mockResponse);

    const result = await parsePrompt('ecommerce product catalog');

    expect(mockLLMClient.chatJSON).toHaveBeenCalled();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe('Product');
  });

  it('should throw error for empty prompt', async () => {
    await expect(parsePrompt('')).rejects.toThrow('Prompt cannot be empty');
    await expect(parsePrompt('   ')).rejects.toThrow('Prompt cannot be empty');
  });

  it('should use provided LLM client', async () => {
    const customClient = {
      chatJSON: jest.fn().mockResolvedValue({
        entities: [],
        relationships: [],
        endpoints: [],
        operations: [],
      }),
    } as any;

    await parsePrompt('test prompt', { llmClient: customClient });

    expect(customClient.chatJSON).toHaveBeenCalled();
    expect(mockLLMClient.chatJSON).not.toHaveBeenCalled();
  });

  it('should handle LLM errors gracefully', async () => {
    mockLLMClient.chatJSON.mockRejectedValue(new Error('LLM service error'));

    await expect(parsePrompt('test prompt')).rejects.toThrow(
      'Failed to parse prompt: LLM service error'
    );
  });

  it('should use custom model and temperature', async () => {
    mockLLMClient.chatJSON.mockResolvedValue({
      entities: [],
      relationships: [],
      endpoints: [],
      operations: [],
    });

    await parsePrompt('test', {
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
      maxTokens: 1000,
    });

    expect(mockLLMClient.chatJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 1000,
      })
    );
  });
});

