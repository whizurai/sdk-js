/**
 * Outcomes resource — run a published outcome by slug, poll it to a terminal
 * status, and read the assets it delivered. Interactive item runs are driven
 * with `workspace()`, `command()`, `invocation()` and `events()`.
 */

import { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  InteractiveCommand,
  InteractiveCommandRequest,
  InteractiveCommandResponse,
  InteractiveInvocationDetail,
  InteractiveWorkspace,
  ListOutcomeRunsQuery,
  ListOutcomeRunsResponse,
  OutcomeRun,
  OutcomeRunAsset,
  OutcomeRunEvent,
  OutcomeRunHandle,
  RunOutcomeRequest,
  TERMINAL_OUTCOME_RUN_STATUSES,
} from '../types';
import { TimeoutError } from '../errors';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Everything in the create body except `inputs`. */
export type RunOutcomeOptions = Omit<RunOutcomeRequest, 'inputs'>;

export interface PollOutcomeRunOptions {
  /** Polling interval in ms. Default: 2000 */
  interval?: number;
  /** Overall timeout in ms. Default: 600_000 (10 min) */
  timeout?: number;
  onUpdate?: (run: OutcomeRun) => void;
}

export interface OutcomeCommandOptions {
  /**
   * Idempotency key (8–200 chars). Generated (UUID v4) when omitted, except for
   * a preview command (`command.preview === true`), which takes none. Pass your
   * own to make a retry of the same user action replay instead of acting twice.
   */
  clientActionId?: string;
}

export class OutcomesResource {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * Start a run of the published outcome `slug` (`POST /v1/outcomes/{slug}/runs`).
   * `inputs` are keyed by the outcome's unlocked `fieldKey`s. Resolves with the
   * run handle for both a new run (202) and an idempotent replay (200).
   */
  async run(
    slug: string,
    inputs: Record<string, unknown>,
    options: RunOutcomeOptions = {}
  ): Promise<OutcomeRunHandle> {
    const body: RunOutcomeRequest = { ...options, inputs };
    const res = await this.http.post(`/v1/outcomes/${encodeURIComponent(slug)}/runs`, body);
    return res.data.outcomeRun as OutcomeRunHandle;
  }

  /** One run's status and, once finished, its `result` (`GET /v1/outcomes/runs/{id}`). */
  async getRun(runId: string): Promise<OutcomeRun> {
    const res = await this.http.get(`/v1/outcomes/runs/${encodeURIComponent(runId)}`);
    return res.data.outcomeRun as OutcomeRun;
  }

  /** Assets the run delivered, oldest first (`GET /v1/outcomes/runs/{id}/assets`). */
  async assets(runId: string): Promise<OutcomeRunAsset[]> {
    const res = await this.http.get(`/v1/outcomes/runs/${encodeURIComponent(runId)}/assets`);
    return (res.data?.assets ?? []) as OutcomeRunAsset[];
  }

  /** Runs of one outcome, newest first, cursor-paginated (`GET /v1/outcomes/{slug}/runs`). */
  async listRuns(slug: string, query: ListOutcomeRunsQuery = {}): Promise<ListOutcomeRunsResponse> {
    const res = await this.http.get(`/v1/outcomes/${encodeURIComponent(slug)}/runs`, { params: query });
    const data = res.data ?? {};
    return { runs: data.runs ?? [], nextCursor: data.nextCursor ?? null };
  }

  /**
   * Server-derived state of an interactive run (`GET /v1/outcomes/runs/{id}/workspace`):
   * items in story order, every slot's chosen revision, versions and freshness,
   * active and failed invocations, next actions with estimates, spend and the
   * finish-remaining scope. 409 NOT_INTERACTIVE for a graph-walk run.
   */
  async workspace(runId: string): Promise<InteractiveWorkspace> {
    const res = await this.http.get(`/v1/outcomes/runs/${encodeURIComponent(runId)}/workspace`);
    return res.data as InteractiveWorkspace;
  }

  /**
   * Send one interactive command (`POST /v1/outcomes/runs/{id}/commands`).
   * Resolves with `{ result, workspace }` for an applied command or preview
   * (202) and for a replay of the same `clientActionId` (200, `result.replayed`).
   * A stale revision is 409 STATE_CHANGED (and the other 409 codes); the thrown
   * error's `details.workspace` is the current workspace.
   */
  async command(
    runId: string,
    command: InteractiveCommand,
    options: OutcomeCommandOptions = {}
  ): Promise<InteractiveCommandResponse> {
    const preview = 'preview' in command && command.preview === true;
    const clientActionId = options.clientActionId ?? (preview ? undefined : uuidv4());
    const body: InteractiveCommandRequest = {
      ...(clientActionId !== undefined && { clientActionId }),
      command,
    };
    const res = await this.http.post(`/v1/outcomes/runs/${encodeURIComponent(runId)}/commands`, body);
    return res.data as InteractiveCommandResponse;
  }

  /**
   * One attempt of an interactive run
   * (`GET /v1/outcomes/runs/{id}/invocations/{invocationId}`): exact source
   * revisions, the input Whiz resolved, per-step submitted requests, served
   * model, acceptance state, timings and cost. Secrets are `[redacted]`.
   */
  async invocation(runId: string, invocationId: string): Promise<InteractiveInvocationDetail> {
    const res = await this.http.get(
      `/v1/outcomes/runs/${encodeURIComponent(runId)}/invocations/${encodeURIComponent(invocationId)}`
    );
    return res.data as InteractiveInvocationDetail;
  }

  /** The run's durable event trail, oldest first, at most 1000 (`GET /v1/outcomes/runs/{id}/events`). */
  async events(runId: string): Promise<OutcomeRunEvent[]> {
    const res = await this.http.get(`/v1/outcomes/runs/${encodeURIComponent(runId)}/events`);
    return (res.data?.events ?? []) as OutcomeRunEvent[];
  }

  /**
   * Poll a run until it reaches a terminal status (SUCCEEDED / FAILED /
   * CANCELLED) or the timeout elapses (throws {@link TimeoutError}). A FAILED
   * run resolves; check `status` and `errorCode`.
   */
  async pollUntilDone(runId: string, options: PollOutcomeRunOptions = {}): Promise<OutcomeRun> {
    const interval = options.interval ?? 2000;
    const timeout = options.timeout ?? 600_000;
    const start = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const run = await this.getRun(runId);
      options.onUpdate?.(run);
      if (TERMINAL_OUTCOME_RUN_STATUSES.includes(run.status)) return run;
      if (Date.now() - start >= timeout) {
        throw new TimeoutError(`Outcome run ${runId} did not finish within ${timeout}ms`);
      }
      await sleep(interval);
    }
  }
}
