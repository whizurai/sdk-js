/**
 * Offline tests for client.embed() / client.rerank() and the embedding-space guard.
 * axios is mocked; errors are produced by running the real response interceptor.
 */

import { AxiosError } from 'axios';
import {
  WhizuraiClient,
  ValidationError,
  AuthenticationError,
  TimeoutError,
  assertSameEmbeddingSpace,
  EmbeddingSpaceError,
  RECOMMENDED_EMBEDDING_MODEL,
} from '../src/index';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');

let responseErrorInterceptor: (err: AxiosError) => Promise<never>;

const mockHttp = {
  interceptors: {
    request: { use: jest.fn() },
    response: {
      use: jest.fn((_onFulfilled, onRejected) => {
        responseErrorInterceptor = onRejected;
      }),
    },
  },
  get: jest.fn(),
  post: jest.fn(),
};

axios.create.mockReturnValue(mockHttp);

function httpError(status: number, data?: unknown): Promise<never> {
  const err = new AxiosError('request failed');
  err.response = { status, statusText: '', data, headers: {}, config: { headers: {} } as never };
  return responseErrorInterceptor(err);
}

// axios is auto-mocked, so AxiosError's constructor is a stub: set fields explicitly.
function transportError(message: string, code: string): Promise<never> {
  const err = new AxiosError(message, code);
  err.message = message;
  err.code = code;
  return responseErrorInterceptor(err);
}

const timeoutError = () => transportError('timeout of 50ms exceeded', 'ECONNABORTED');
const networkError = () => transportError('connect ECONNREFUSED 127.0.0.1:3000', 'ECONNREFUSED');

const SPACE =
  'qwen3-embedding-0.6b:97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3:1024:normalized:qwen3-embed-instruct-v1';

const DOCS = ['alpha', 'beta', 'gamma'];

let client: WhizuraiClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = new WhizuraiClient({ apiKey: 'sk_test', baseUrl: 'http://localhost:3000' });
});

describe('client.embed', () => {
  it('posts the wire body and returns whizai provenance', async () => {
    mockHttp.post.mockResolvedValueOnce({
      data: {
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
        model: RECOMMENDED_EMBEDDING_MODEL,
        whizai: {
          provider: 'spark',
          runtime: 'vllm',
          execution: 'local',
          worker: { id: 'w1', name: 'spark02' },
          model: 'qwen3-embedding-0.6b',
          model_revision: '97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3',
          dimensions: 1024,
          normalized: true,
          prompt_contract: 'qwen3-embed-instruct-v1',
          embedding_space: SPACE,
          attributable: true,
        },
      },
    });

    const res = await client.embed({
      model: RECOMMENDED_EMBEDDING_MODEL,
      input: ['hello'],
      inputType: 'query',
      instruction: 'find events',
    });

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/embeddings', {
      model: 'embedding-qwen3-0.6b-v1',
      input: ['hello'],
      input_type: 'query',
      instruction: 'find events',
    });
    expect(res.whizai?.embedding_space).toBe(SPACE);
    expect(res.whizai?.model_revision).toBe('97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3');
    expect(res.whizai?.worker?.name).toBe('spark02');
    expect(res.data[0].embedding).toEqual([0.1, 0.2]);
  });

  it('tolerates a response with no provenance (older models)', async () => {
    mockHttp.post.mockResolvedValueOnce({
      data: { object: 'list', data: [{ object: 'embedding', index: 0, embedding: [1] }], model: 'nomic-embed-text' },
    });
    const res = await client.embed({ model: 'nomic-embed-text', input: 'x' });
    expect(res.whizai).toBeUndefined();
  });

  it('requires an explicit model', async () => {
    await expect(client.embed({ model: '', input: 'x' })).rejects.toBeInstanceOf(ValidationError);
    expect(mockHttp.post).not.toHaveBeenCalled();
  });
});

describe('client.rerank', () => {
  it('returns ranked results with degraded=false', async () => {
    mockHttp.post.mockResolvedValueOnce({
      data: {
        id: 'rr_1',
        model: 'rerank-qwen3-0.6b-v1',
        results: [
          { index: 2, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.4 },
        ],
        whizai: { provider: 'spark', runtime: 'vllm', execution: 'local', model: 'qwen3-reranker-0.6b', model_revision: null, prompt_contract: 'qwen3-rerank-v1' },
      },
    });

    const res = await client.rerank({ model: 'rerank-qwen3-0.6b-v1', query: 'q', documents: DOCS, topN: 2 });

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/v1/rerank',
      { model: 'rerank-qwen3-0.6b-v1', query: 'q', documents: DOCS, top_n: 2 },
      undefined
    );
    expect(res.degraded).toBe(false);
    expect(res.results.map((r) => r.index)).toEqual([2, 0]);
    expect(res.whizai?.prompt_contract).toBe('qwen3-rerank-v1');
  });

  it('throws on 503 without fallback', async () => {
    mockHttp.post.mockImplementationOnce(() => httpError(503, { error: { message: 'no worker' } }));
    await expect(client.rerank({ model: 'm', query: 'q', documents: DOCS })).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['503', () => httpError(503, { error: { message: 'no worker' } }), 'http_503'],
    ['504', () => httpError(504), 'http_504'],
    ['timeout', timeoutError, 'timeout'],
    ['network error', networkError, 'network_error'],
  ])('degrades to original order on %s with fallback', async (_label, fail, reason) => {
    mockHttp.post.mockImplementationOnce(fail);
    const res = await client.rerank(
      { model: 'm', query: 'q', documents: DOCS },
      { fallback: 'original-order', timeoutMs: 50 }
    );
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/rerank', expect.any(Object), { timeout: 50 });
    expect(res.degraded).toBe(true);
    if (res.degraded) {
      expect(res.reason).toBe(reason);
      expect(res.error).toBeInstanceOf(Error);
    }
    expect(res.results).toEqual([
      { index: 0, relevance_score: null },
      { index: 1, relevance_score: null },
      { index: 2, relevance_score: null },
    ]);
  });

  it('honours topN when degraded', async () => {
    mockHttp.post.mockImplementationOnce(() => httpError(503));
    const res = await client.rerank({ model: 'm', query: 'q', documents: DOCS, topN: 2 }, { fallback: 'original-order' });
    expect(res.results.map((r) => r.index)).toEqual([0, 1]);
  });

  it('maps an axios timeout to TimeoutError when not degrading', async () => {
    mockHttp.post.mockImplementationOnce(timeoutError);
    await expect(client.rerank({ model: 'm', query: 'q', documents: DOCS })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('still throws 400 even with fallback', async () => {
    mockHttp.post.mockImplementationOnce(() => httpError(400, { error: { message: 'documents must be 1..64' } }));
    await expect(
      client.rerank({ model: 'm', query: 'q', documents: [] }, { fallback: 'original-order' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('still throws 401 even with fallback', async () => {
    mockHttp.post.mockImplementationOnce(() => httpError(401));
    await expect(
      client.rerank({ model: 'm', query: 'q', documents: DOCS }, { fallback: 'original-order' })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('requires an explicit model even with fallback', async () => {
    await expect(
      client.rerank({ model: '', query: 'q', documents: DOCS }, { fallback: 'original-order' })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('assertSameEmbeddingSpace', () => {
  it('returns the shared space for identical strings', () => {
    expect(assertSameEmbeddingSpace(SPACE, SPACE)).toBe(SPACE);
  });

  it('accepts responses and provenance blocks', () => {
    expect(assertSameEmbeddingSpace({ whizai: { embedding_space: SPACE } }, { embedding_space: SPACE })).toBe(SPACE);
  });

  it('throws on mismatch', () => {
    const other = SPACE.replace(':1024:', ':768:');
    expect(() => assertSameEmbeddingSpace(SPACE, other)).toThrow(EmbeddingSpaceError);
    try {
      assertSameEmbeddingSpace(SPACE, other);
    } catch (e) {
      expect((e as EmbeddingSpaceError).code).toBe('EMBEDDING_SPACE_MISMATCH');
    }
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['response without whizai', { whizai: undefined }],
    ['unknown revision', 'qwen3-embedding-0.6b:unknown:1024:normalized:qwen3-embed-instruct-v1'],
  ])('throws when either side is %s', (_label, bad) => {
    expect(() => assertSameEmbeddingSpace(SPACE, bad as never)).toThrow(EmbeddingSpaceError);
    expect(() => assertSameEmbeddingSpace(bad as never, SPACE)).toThrow(EmbeddingSpaceError);
  });
});
