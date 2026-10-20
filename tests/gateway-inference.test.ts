/**
 * Offline tests for client.generateText() / client.describeImage().
 * axios is mocked: these calls go to the gateway client at `baseUrl`, never to model-router.
 */

import { WhizuraiClient, ValidationError } from '../src/index';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');

const mockHttp = {
  interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  get: jest.fn(),
  post: jest.fn(),
};
axios.create.mockReturnValue(mockHttp);

function makeClient(): WhizuraiClient {
  return new WhizuraiClient({ apiKey: 'test-key', baseUrl: 'https://api.example.test' });
}

beforeEach(() => {
  mockHttp.post.mockReset();
  axios.create.mockClear();
});

describe('generateText()', () => {
  it('posts the wire body to the gateway and returns the response unchanged', async () => {
    const wire = {
      id: 'gen_1',
      object: 'text_completion',
      created: 1,
      model: 'GLM-5.3-Flash-EXL3',
      choices: [{ text: 'hello', index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      execution: { execution: 'fleet', runtime: 'vllm', fleet_job_id: 'j1' },
    };
    mockHttp.post.mockResolvedValueOnce({ data: wire });
    const client = makeClient();
    const body = {
      prompt: 'Say hello',
      model: 'chat',
      reasoningEffort: 'none' as const,
      metadata: { priority: 'interactive' as const, timeoutMs: 30_000 },
    };

    await expect(client.generateText(body, { timeoutMs: 45_000 })).resolves.toEqual(wire);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/generate/text', body, { timeout: 45_000 });
    // One gateway client only: no model-router client is built for this call.
    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(axios.create.mock.calls[0][0].baseURL).toBe('https://api.example.test');
  });

  it('sends no per-call config when no timeout is given', async () => {
    mockHttp.post.mockResolvedValueOnce({ data: {} });
    await makeClient().generateText({ prompt: 'x' });
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/generate/text', { prompt: 'x' }, undefined);
  });

  it('rejects an empty prompt before any network call', async () => {
    await expect(makeClient().generateText({ prompt: '  ' })).rejects.toBeInstanceOf(ValidationError);
    expect(mockHttp.post).not.toHaveBeenCalled();
  });
});

describe('describeImage()', () => {
  it('posts base64 bytes to /v1/images/describe', async () => {
    const wire = {
      description: '{"heroLabel":"dog"}',
      provider: 'ollama',
      model: 'qwen3-vl:30b-a3b-instruct',
      requestId: 'r1',
      responseTime: 5.1,
    };
    mockHttp.post.mockResolvedValueOnce({ data: wire });
    const body = {
      image: 'aGVsbG8=',
      prompt: 'Describe the scene as JSON',
      model: 'qwen3-vl:30b-a3b-instruct',
      maxTokens: 900,
      temperature: 0,
      requestId: 'r1',
      metadata: { priority: 'interactive' as const, timeoutMs: 315_000 },
    };

    await expect(makeClient().describeImage(body, { timeoutMs: 330_000 })).resolves.toEqual(wire);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/images/describe', body, { timeout: 330_000 });
  });

  it('requires exactly one of image or imageUrl', async () => {
    const client = makeClient();
    await expect(client.describeImage({ prompt: 'x' })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client.describeImage({ image: 'aGVsbG8=', imageUrl: 'https://example.test/a.png' })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockHttp.post).not.toHaveBeenCalled();
  });
});
