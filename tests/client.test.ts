/**
 * Offline unit tests for the capability-first WhizuraiClient.
 *
 * axios is mocked so these run without a live platform. They assert the SDK
 * calls the correct endpoints, unwraps responses, and maps HTTP errors to the
 * typed error hierarchy.
 */

import { AxiosError } from 'axios';
import {
  WhizuraiClient,
  createClient,
  NotFoundError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  WhizuraiError,
} from '../src/index';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');

let responseErrorInterceptor: (err: AxiosError) => unknown;

const mockHttp = {
  defaults: { baseURL: 'http://localhost:3000' },
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
  put: jest.fn(),
  delete: jest.fn(),
};

axios.create.mockReturnValue(mockHttp);

const config = { apiKey: 'sk_test_123', baseUrl: 'http://localhost:3000' };

function makeAxiosError(status: number, data?: unknown): AxiosError {
  const err = new AxiosError('request failed');
  err.response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: {} } as never,
  };
  return err;
}

describe('WhizuraiClient construction', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient(config);
  });

  it('builds with the four capability-first resources', () => {
    expect(client.capabilities).toBeDefined();
    expect(client.runs).toBeDefined();
    expect(client.artifacts).toBeDefined();
    expect(client.triggers).toBeDefined();
  });

  it('does NOT expose the legacy workflow surface', () => {
    expect((client as unknown as Record<string, unknown>).workflows).toBeUndefined();
    expect((client as unknown as Record<string, unknown>).workflowRuns).toBeUndefined();
    expect((client as unknown as Record<string, unknown>).generate).toBeUndefined();
  });

  it('requires an apiKey', () => {
    expect(() => new WhizuraiClient({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('createClient returns an instance', () => {
    expect(createClient(config)).toBeInstanceOf(WhizuraiClient);
  });
});

describe('capabilities', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient(config);
  });

  it('list() calls GET /v1/capabilities and normalizes the envelope', async () => {
    mockHttp.get.mockResolvedValue({
      data: { capabilities: [{ id: 'c1' }], total: 1, nextCursor: 'next' },
    });
    const res = await client.capabilities.list({ status: 'published', limit: 5 });
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/capabilities', {
      params: { status: 'published', limit: 5 },
    });
    expect(res.capabilities).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.nextCursor).toBe('next');
  });

  it('get() unwraps { capability }', async () => {
    mockHttp.get.mockResolvedValue({ data: { capability: { id: 'c1', slug: 'image.generate' } } });
    const cap = await client.capabilities.get('image.generate');
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/capabilities/image.generate');
    expect(cap.id).toBe('c1');
  });

  it('run() posts to /execute with idempotency header and returns { run }', async () => {
    mockHttp.post.mockResolvedValue({ data: { run: { id: 'r1', status: 'pending' } } });
    const { run } = await client.capabilities.run('c1', { prompt: 'hi' }, { idempotencyKey: 'k1' });
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/v1/capabilities/c1/execute',
      { input: { prompt: 'hi' }, idempotencyKey: 'k1' },
      { headers: { 'x-idempotency-key': 'k1' } }
    );
    expect(run.id).toBe('r1');
  });

  it('cancel() posts to the capability-run cancel route', async () => {
    mockHttp.post.mockResolvedValue({ data: { id: 'r1', status: 'cancelled' } });
    const res = await client.capabilities.cancel('r1');
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/capabilities/capability-runs/r1/cancel');
    expect(res.status).toBe('cancelled');
  });

  it('dryRun() derives valid from status', async () => {
    mockHttp.post.mockResolvedValue({ data: { status: 'valid', estimatedCost: 3 } });
    const res = await client.capabilities.dryRun('c1', { prompt: 'hi' });
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/capabilities/c1/dry-run', {
      input: { prompt: 'hi' },
    });
    expect(res.valid).toBe(true);
    expect(res.estimatedCost).toBe(3);
  });

  it('does not expose authoring methods', () => {
    const caps = client.capabilities as unknown as Record<string, unknown>;
    expect(caps.create).toBeUndefined();
    expect(caps.update).toBeUndefined();
    expect(caps.delete).toBeUndefined();
    expect(caps.publish).toBeUndefined();
  });
});

describe('runs', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient(config);
  });

  it('get() calls GET /v1/workflow-runs/:id', async () => {
    mockHttp.get.mockResolvedValue({ data: { id: 'r1', status: 'succeeded' } });
    const run = await client.runs.get('r1');
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/workflow-runs/r1');
    expect(run.status).toBe('succeeded');
  });

  it('logs() tolerates array and { logs } shapes', async () => {
    mockHttp.get.mockResolvedValue({ data: { logs: [{ message: 'a' }] } });
    expect(await client.runs.logs('r1')).toHaveLength(1);
    mockHttp.get.mockResolvedValue({ data: [{ message: 'b' }] });
    expect(await client.runs.logs('r1')).toHaveLength(1);
  });

  it('artifacts() flattens outputs/inputs when not grouped', async () => {
    mockHttp.get.mockResolvedValue({ data: { outputs: [{ id: 'a1' }], inputs: [{ id: 'a2' }] } });
    const arts = await client.runs.artifacts('r1');
    expect(arts.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('pollUntilDone() resolves once terminal', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ data: { id: 'r1', status: 'running' } })
      .mockResolvedValueOnce({ data: { id: 'r1', status: 'succeeded' } });
    const run = await client.runs.pollUntilDone('r1', { interval: 1, timeout: 5000 });
    expect(run.status).toBe('succeeded');
    expect(mockHttp.get).toHaveBeenCalledTimes(2);
  });

  it('pollUntilDone() times out', async () => {
    mockHttp.get.mockResolvedValue({ data: { id: 'r1', status: 'running' } });
    await expect(client.runs.pollUntilDone('r1', { interval: 1, timeout: 0 })).rejects.toThrow(
      /did not complete/
    );
  });
});

describe('artifacts', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient(config);
  });

  it('list() maps count to total', async () => {
    mockHttp.get.mockResolvedValue({ data: { artifacts: [{ id: 'a1' }], count: 1 } });
    const res = await client.artifacts.list({ runId: 'r1' });
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/artifacts', { params: { runId: 'r1' } });
    expect(res.total).toBe(1);
    expect(res.count).toBe(1);
  });

  it('get() calls GET /v1/artifacts/:id', async () => {
    mockHttp.get.mockResolvedValue({ data: { id: 'a1', type: 'image' } });
    const art = await client.artifacts.get('a1');
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/artifacts/a1');
    expect(art.type).toBe('image');
  });
});

describe('artifacts.download credential handling', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.resetAllMocks();
    axios.create.mockReturnValue(mockHttp);
    client = new WhizuraiClient(config);
  });

  it('does not send the platform key to a foreign origin', async () => {
    mockHttp.get.mockResolvedValueOnce({
      data: { id: 'a1', url: 'https://storage.example.net/a.wav?sig=x' },
    });
    axios.get.mockResolvedValue({ data: new ArrayBuffer(4) });
    const buf = await client.artifacts.download('a1');
    expect(buf.byteLength).toBe(4);
    // Only the metadata lookup used the authenticated client.
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith('https://storage.example.net/a.wav?sig=x', {
      responseType: 'arraybuffer',
      headers: {},
    });
  });

  it('uses the authenticated client for a relative or same-origin URL', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ data: { id: 'a1', url: '/v1/artifacts/a1/content' } })
      .mockResolvedValueOnce({ status: 200, data: new ArrayBuffer(2) })
      .mockResolvedValueOnce({ data: { id: 'a2', url: 'http://localhost:3000/files/a2' } })
      .mockResolvedValueOnce({ status: 200, data: new ArrayBuffer(3) });
    expect((await client.artifacts.download('a1')).byteLength).toBe(2);
    expect((await client.artifacts.download('a2')).byteLength).toBe(3);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('follows a redirect off the gateway without credentials', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ data: { id: 'a1', url: '/v1/artifacts/a1/content' } })
      .mockResolvedValueOnce({ status: 302, headers: { location: 'https://cdn.example.net/x' } });
    axios.get.mockResolvedValue({ data: new ArrayBuffer(5) });
    expect((await client.artifacts.download('a1')).byteLength).toBe(5);
    expect(axios.get).toHaveBeenCalledWith('https://cdn.example.net/x', {
      responseType: 'arraybuffer',
      headers: {},
    });
  });

  it('maps a foreign-origin failure to a typed error', async () => {
    mockHttp.get.mockResolvedValueOnce({ data: { id: 'a1', url: 'https://s.example.net/a' } });
    axios.get.mockRejectedValue(makeAxiosError(403, 'denied'));
    await expect(client.artifacts.download('a1')).rejects.toBeInstanceOf(WhizuraiError);
  });
});

describe('triggers', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient(config);
  });

  it('list() returns { triggers, count }', async () => {
    mockHttp.get.mockResolvedValue({ data: { triggers: [{ id: 't1' }], count: 1 } });
    const res = await client.triggers.list();
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/triggers', { params: {} });
    expect(res.count).toBe(1);
  });

  it('create() posts to /v1/triggers', async () => {
    mockHttp.post.mockResolvedValue({ data: { id: 't1', name: 'T', enabled: true } });
    const t = await client.triggers.create({
      name: 'T',
      eventType: 'artifact.created',
      actionType: 'execute_capability',
      actionConfig: { capabilityId: 'c1' },
    });
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/triggers', expect.objectContaining({ name: 'T' }));
    expect(t.id).toBe('t1');
  });

  it('update() puts to /v1/triggers/:id', async () => {
    mockHttp.put.mockResolvedValue({ data: { id: 't1', enabled: false } });
    const t = await client.triggers.update('t1', { enabled: false });
    expect(mockHttp.put).toHaveBeenCalledWith('/v1/triggers/t1', { enabled: false });
    expect(t.enabled).toBe(false);
  });

  it('delete() resolves to undefined', async () => {
    mockHttp.delete.mockResolvedValue({ data: { message: 'ok' } });
    await expect(client.triggers.delete('t1')).resolves.toBeUndefined();
    expect(mockHttp.delete).toHaveBeenCalledWith('/v1/triggers/t1');
  });

  it('test() posts to /v1/triggers/:id/test', async () => {
    mockHttp.post.mockResolvedValue({ data: { success: true } });
    const res = await client.triggers.test('t1', { artifact: { id: 'x' } });
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/triggers/t1/test', { artifact: { id: 'x' } });
    expect(res.success).toBe(true);
  });

  it('health() and status() hit the right paths', async () => {
    mockHttp.get.mockResolvedValueOnce({ data: { status: 'healthy' } });
    expect((await client.health()).status).toBe('healthy');
    expect(mockHttp.get).toHaveBeenCalledWith('/health');
    mockHttp.get.mockResolvedValueOnce({ data: { status: 'operational', version: '0.2.0' } });
    expect((await client.status()).version).toBe('0.2.0');
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/status');
  });
});

describe('error normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-create client so the response interceptor is captured fresh.
    new WhizuraiClient(config);
  });

  it('maps 404 to NotFoundError with a "not found" message', () => {
    const err = responseErrorInterceptor(makeAxiosError(404, {})) as Promise<never>;
    return expect(err).rejects.toMatchObject({
      name: 'NotFoundError',
      status: 404,
    }).then(() =>
      expect(err.catch((e) => (e as Error).message)).resolves.toMatch(/not found/i)
    );
  });

  it('maps statuses to the typed hierarchy', async () => {
    await expect(
      responseErrorInterceptor(makeAxiosError(401)) as Promise<never>
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      responseErrorInterceptor(makeAxiosError(404)) as Promise<never>
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      responseErrorInterceptor(makeAxiosError(422)) as Promise<never>
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      responseErrorInterceptor(makeAxiosError(429)) as Promise<never>
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      responseErrorInterceptor(makeAxiosError(500)) as Promise<never>
    ).rejects.toBeInstanceOf(WhizuraiError);
  });

  it('prefers the server-provided message', async () => {
    await expect(
      responseErrorInterceptor(makeAxiosError(400, { error: { message: 'bad input' } })) as Promise<never>
    ).rejects.toThrow('bad input');
  });
});
