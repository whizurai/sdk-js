/**
 * Offline tests for client.outcomes (axios mocked).
 */

import { AxiosError } from 'axios';
import {
  WhizuraiClient,
  NotFoundError,
  WhizuraiError,
  TimeoutError,
  TERMINAL_OUTCOME_RUN_STATUSES,
} from '../src/index';
import type { OutcomeRun } from '../src/index';

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

function makeAxiosError(status: number, data?: unknown): AxiosError {
  const err = new AxiosError('request failed');
  err.response = { status, statusText: '', data, headers: {}, config: { headers: {} } as never };
  return err;
}

function run(status: OutcomeRun['status'], extra: Partial<OutcomeRun> = {}): OutcomeRun {
  return {
    id: 'or_1',
    status,
    outcomeSlug: 'product-shot',
    outcomeVersion: '3',
    variantSlug: null,
    inputs: { prompt: 'a red bicycle' },
    result: null,
    errorMessage: null,
    errorCode: null,
    estimatedACU: 12,
    acuConsumed: null,
    startedAt: '2026-11-10T00:00:00.000Z',
    completedAt: null,
    ...extra,
  };
}

describe('client.outcomes', () => {
  let client: WhizuraiClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new WhizuraiClient({ apiKey: 'sk_test_123', baseUrl: 'http://localhost:3000' });
  });

  it('run() posts inputs plus options to /v1/outcomes/{slug}/runs and unwraps outcomeRun', async () => {
    const handle = {
      id: 'or_1',
      status: 'PENDING',
      outcomeSlug: 'product shot',
      outcomeVersion: '3',
      variantSlug: 'square',
      estimatedACU: 12,
      startedAt: '2026-11-10T00:00:00.000Z',
      statusUrl: '/v1/outcomes/runs/or_1',
    };
    mockHttp.post.mockResolvedValueOnce({ status: 202, data: { outcomeRun: handle } });

    const out = await client.outcomes.run(
      'product shot',
      { prompt: 'a red bicycle' },
      { variant: 'square', idempotencyKey: 'k1' }
    );

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/outcomes/product%20shot/runs', {
      variant: 'square',
      idempotencyKey: 'k1',
      inputs: { prompt: 'a red bicycle' },
    });
    expect(out).toEqual(handle);
  });

  it('run() treats an idempotent replay (200) like a new run', async () => {
    mockHttp.post.mockResolvedValueOnce({ status: 200, data: { outcomeRun: { id: 'or_1', status: 'RUNNING' } } });
    const out = await client.outcomes.run('product-shot', {});
    expect(out.id).toBe('or_1');
  });

  it('run() surfaces INSUFFICIENT_BALANCE with its purchase details', async () => {
    const body = {
      error: 'INSUFFICIENT_BALANCE',
      message: 'Not enough ACU.',
      details: { purchase: { url: 'https://app.whizur.ai/app/billing?intent=topup', canSelfServe: true } },
    };
    const err = responseErrorInterceptor(makeAxiosError(402, body));
    mockHttp.post.mockReturnValueOnce(err);
    await expect(client.outcomes.run('product-shot', {})).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      status: 402,
      details: body,
    });
    await expect(err).rejects.toBeInstanceOf(WhizuraiError);
  });

  it('getRun() reads /v1/outcomes/runs/{id}', async () => {
    mockHttp.get.mockResolvedValueOnce({ data: { outcomeRun: run('RUNNING') } });
    const r = await client.outcomes.getRun('or_1');
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/runs/or_1');
    expect(r.status).toBe('RUNNING');
  });

  it('getRun() maps OUTCOME_RUN_NOT_FOUND to NotFoundError', async () => {
    mockHttp.get.mockReturnValueOnce(
      responseErrorInterceptor(
        makeAxiosError(404, { error: 'OUTCOME_RUN_NOT_FOUND', message: "Outcome run 'x' was not found." })
      )
    );
    await expect(client.outcomes.getRun('x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('assets() returns the assets array, empty when absent', async () => {
    const asset = {
      id: 'a1',
      type: 'image.generated',
      storageRef: 's3://bucket/a1.png',
      metadata: null,
      tags: [],
      createdAt: '2026-11-10T00:01:00.000Z',
    };
    mockHttp.get.mockResolvedValueOnce({ data: { assets: [asset] } });
    expect(await client.outcomes.assets('or_1')).toEqual([asset]);
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/runs/or_1/assets');

    mockHttp.get.mockResolvedValueOnce({ data: {} });
    expect(await client.outcomes.assets('or_1')).toEqual([]);
  });

  it('listRuns() passes limit/cursor and normalizes nextCursor', async () => {
    mockHttp.get.mockResolvedValueOnce({ data: { runs: [{ id: 'or_2' }] } });
    const page = await client.outcomes.listRuns('product-shot', { limit: 5, cursor: 'or_9' });
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/product-shot/runs', {
      params: { limit: 5, cursor: 'or_9' },
    });
    expect(page).toEqual({ runs: [{ id: 'or_2' }], nextCursor: null });
  });

  it('pollUntilDone() resolves at SUCCEEDED and reports each poll', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ data: { outcomeRun: run('PENDING') } })
      .mockResolvedValueOnce({ data: { outcomeRun: run('RUNNING') } })
      .mockResolvedValueOnce({
        data: { outcomeRun: run('SUCCEEDED', { result: { image: 'a1' }, completedAt: '2026-11-10T00:02:00.000Z' }) },
      });
    const seen: string[] = [];
    const done = await client.outcomes.pollUntilDone('or_1', { interval: 1, onUpdate: (r) => seen.push(r.status) });
    expect(done.status).toBe('SUCCEEDED');
    expect(done.result).toEqual({ image: 'a1' });
    expect(seen).toEqual(['PENDING', 'RUNNING', 'SUCCEEDED']);
  });

  it('pollUntilDone() resolves (does not throw) on FAILED', async () => {
    mockHttp.get.mockResolvedValueOnce({
      data: { outcomeRun: run('FAILED', { errorCode: 'STEP_FAILED', errorMessage: 'boom' }) },
    });
    const done = await client.outcomes.pollUntilDone('or_1', { interval: 1 });
    expect(done).toMatchObject({ status: 'FAILED', errorCode: 'STEP_FAILED' });
  });

  it('pollUntilDone() throws TimeoutError when the run never finishes', async () => {
    mockHttp.get.mockResolvedValue({ data: { outcomeRun: run('RUNNING') } });
    await expect(client.outcomes.pollUntilDone('or_1', { interval: 1, timeout: 0 })).rejects.toBeInstanceOf(
      TimeoutError
    );
    mockHttp.get.mockReset();
  });

  it('treats SUCCEEDED, FAILED and CANCELLED as terminal', () => {
    expect([...TERMINAL_OUTCOME_RUN_STATUSES].sort()).toEqual(['CANCELLED', 'FAILED', 'SUCCEEDED']);
  });
});
