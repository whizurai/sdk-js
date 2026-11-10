/**
 * Outcomes resource — run a published outcome by slug, poll it to a terminal
 * status, and read the assets it delivered.
 */

import { AxiosInstance } from 'axios';
import {
  ListOutcomeRunsQuery,
  ListOutcomeRunsResponse,
  OutcomeRun,
  OutcomeRunAsset,
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
