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
  it('run() forwards executionPolicy', async () => {
    mockHttp.post.mockResolvedValueOnce({ status: 202, data: { outcomeRun: { id: 'or_1', status: 'PENDING' } } });
    await client.outcomes.run('five-shot', { idea: 'a fox' }, { executionPolicy: 'review' });
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/outcomes/five-shot/runs', {
      executionPolicy: 'review',
      inputs: { idea: 'a fox' },
    });
  });

  describe('interactive runs', () => {
    const workspace = { runId: 'or 1', status: 'RUNNING', mode: 'review', controlRevision: 3 };

    it('workspace() reads /v1/outcomes/runs/{id}/workspace', async () => {
      mockHttp.get.mockResolvedValueOnce({ data: workspace });
      const ws = await client.outcomes.workspace('or 1');
      expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/runs/or%201/workspace');
      expect(ws).toEqual(workspace);
    });

    it('command() posts the command with the given clientActionId', async () => {
      const body = { result: { controlRevision: 4, invocationIds: ['inv_1'], dispatch: true }, workspace };
      mockHttp.post.mockResolvedValueOnce({ status: 202, data: body });
      const command = {
        action: 'generate' as const,
        operation: 'image',
        targets: [{ itemId: 'it_1', sourceRevisionId: 'rev_1' }],
      };
      const out = await client.outcomes.command('or_1', command, { clientActionId: 'action-0001' });
      expect(mockHttp.post).toHaveBeenCalledWith('/v1/outcomes/runs/or_1/commands', {
        clientActionId: 'action-0001',
        command,
      });
      expect(out).toEqual(body);
    });

    it('command() generates a UUID clientActionId when omitted', async () => {
      mockHttp.post.mockResolvedValueOnce({ status: 202, data: { result: {}, workspace } });
      await client.outcomes.command('or_1', { action: 'pause', expectedControlRevision: 3 });
      const sent = mockHttp.post.mock.calls[0][1];
      expect(sent.command).toEqual({ action: 'pause', expectedControlRevision: 3 });
      expect(sent.clientActionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('command() sends no clientActionId for a preview', async () => {
      mockHttp.post.mockResolvedValueOnce({ status: 202, data: { result: { preview: {} }, workspace } });
      await client.outcomes.command('or_1', { action: 'finish_remaining', expectedControlRevision: 3, preview: true });
      expect(mockHttp.post).toHaveBeenCalledWith('/v1/outcomes/runs/or_1/commands', {
        command: { action: 'finish_remaining', expectedControlRevision: 3, preview: true },
      });
    });

    it('command() surfaces STATE_CHANGED with the current workspace', async () => {
      const body = { error: 'STATE_CHANGED', message: 'Refresh.', workspace };
      mockHttp.post.mockReturnValueOnce(responseErrorInterceptor(makeAxiosError(409, body)));
      await expect(
        client.outcomes.command('or_1', { action: 'retry', invocationId: 'inv_1' }, { clientActionId: 'action-0002' })
      ).rejects.toMatchObject({ code: 'STATE_CHANGED', status: 409, details: body });
    });

    it('invocation() reads one invocation', async () => {
      const detail = { invocation: { id: 'inv/1' }, acceptance: 'submitted' };
      mockHttp.get.mockResolvedValueOnce({ data: detail });
      expect(await client.outcomes.invocation('or_1', 'inv/1')).toEqual(detail);
      expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/runs/or_1/invocations/inv%2F1');
    });

    it('events() returns the events array, empty when absent', async () => {
      const event = {
        id: 'ev_1',
        outcomeRunId: 'or_1',
        type: 'edit_applied',
        actorType: 'api_key',
        actorId: 'k1',
        itemId: 'it_1',
        data: null,
        createdAt: '2026-11-11T00:00:00.000Z',
      };
      mockHttp.get.mockResolvedValueOnce({ data: { events: [event] } });
      expect(await client.outcomes.events('or_1')).toEqual([event]);
      expect(mockHttp.get).toHaveBeenCalledWith('/v1/outcomes/runs/or_1/events');
      mockHttp.get.mockResolvedValueOnce({ data: {} });
      expect(await client.outcomes.events('or_1')).toEqual([]);
    });
  });
});
