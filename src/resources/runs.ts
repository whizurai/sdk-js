/**
 * Runs resource — track capability executions, stream logs/artifacts, and
 * poll a run to completion.
 */

import { AxiosInstance } from 'axios';
import {
  Artifact,
  ListRunsResponse,
  PollOptions,
  Run,
  RunLogEntry,
  TERMINAL_RUN_STATUSES,
} from '../types';
import { TimeoutError } from '../errors';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface ListRunsOptions {
  capabilityId?: string;
  capabilitySlug?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export class RunsResource {
  constructor(private readonly http: AxiosInstance) {}

  /** Fetch a single run by id. */
  async get(runId: string): Promise<Run> {
    const res = await this.http.get(`/v1/workflow-runs/${encodeURIComponent(runId)}`);
    return res.data as Run;
  }

  /** List runs, optionally filtered by capability/status. */
  async list(options: ListRunsOptions = {}): Promise<ListRunsResponse> {
    const res = await this.http.get('/v1/workflow-runs', { params: options });
    const data = res.data ?? {};
    return {
      runs: data.runs ?? [],
      total: data.total,
      nextCursor: data.nextCursor ?? null,
    };
  }

  /** Structured logs for a run. */
  async logs(runId: string): Promise<RunLogEntry[]> {
    const res = await this.http.get(`/v1/workflow-runs/${encodeURIComponent(runId)}/logs`);
    const data = res.data;
    return Array.isArray(data) ? data : data?.logs ?? [];
  }

  /** Artifacts produced by a run. */
  async artifacts(runId: string): Promise<Artifact[]> {
    const res = await this.http.get(
      `/v1/workflow-runs/${encodeURIComponent(runId)}/artifacts`,
      { params: { grouped: '1' } }
    );
    const data = res.data;
    if (Array.isArray(data)) return data;
    return data?.artifacts ?? [...(data?.outputs ?? []), ...(data?.inputs ?? [])];
  }

  /**
   * Poll a run until it reaches a terminal status (succeeded/failed/cancelled)
   * or the timeout elapses.
   */
  async pollUntilDone(runId: string, options: PollOptions = {}): Promise<Run> {
    const interval = options.interval ?? 2000;
    const timeout = options.timeout ?? 600_000;
    const start = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const run = await this.get(runId);
      options.onUpdate?.(run);
      if (TERMINAL_RUN_STATUSES.includes(run.status)) return run;
      if (Date.now() - start >= timeout) {
        throw new TimeoutError(`Run ${runId} did not complete within ${timeout}ms`);
      }
      await sleep(interval);
    }
  }
}
