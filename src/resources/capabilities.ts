/**
 * Capabilities resource — list, inspect, dry-run, and execute capabilities.
 *
 * Capability CRUD (create/update/publish/deprecate) is an authoring concern
 * and is deliberately NOT part of the public client surface.
 */

import { AxiosInstance } from 'axios';
import {
  CancelCapabilityRunResponse,
  Capability,
  DryRunResult,
  ExecuteCapabilityResponse,
  ListCapabilitiesOptions,
  ListCapabilitiesResponse,
  Run,
  RunCapabilityOptions,
  RunEvent,
  RunEventsOptions,
} from '../types';
import { SseParser } from '../sse';
import { WhizuraiError } from '../errors';

export class CapabilitiesResource {
  constructor(private readonly http: AxiosInstance) {}

  /** List capabilities, optionally filtered by status/category/search. */
  async list(options: ListCapabilitiesOptions = {}): Promise<ListCapabilitiesResponse> {
    const res = await this.http.get('/v1/capabilities', { params: options });
    const data = res.data ?? {};
    return {
      capabilities: data.capabilities ?? [],
      total: data.total,
      nextCursor: data.nextCursor ?? null,
    };
  }

  /** Fetch a single capability by id or slug. */
  async get(idOrSlug: string): Promise<Capability> {
    const res = await this.http.get(`/v1/capabilities/${encodeURIComponent(idOrSlug)}`);
    const data = res.data;
    // Platform wraps as { capability: {...} }; tolerate the unwrapped shape too.
    return (data && 'capability' in data ? data.capability : data) as Capability;
  }

  /**
   * Execute a capability with the given input. Returns the created run
   * (wrapped as `{ run }`). Use {@link RunsResource.pollUntilDone} to await it.
   */
  async run(
    idOrSlug: string,
    input: Record<string, unknown>,
    options: RunCapabilityOptions = {}
  ): Promise<ExecuteCapabilityResponse> {
    const body: Record<string, unknown> = { input };
    if (options.idempotencyKey) body.idempotencyKey = options.idempotencyKey;
    if (options.routing) body.routing = options.routing;
    if (options.metadata) body.metadata = options.metadata;
    if (options.executionMode) body.executionMode = options.executionMode;
    // The platform reads the completion webhook from `runFlags.callbackUrl`
    // only; a top-level `webhookUrl` is ignored server-side.
    const runFlags = {
      ...(options.webhookUrl && { callbackUrl: options.webhookUrl }),
      ...options.runFlags,
    };
    if (Object.keys(runFlags).length > 0) body.runFlags = runFlags;
    if (options.mock) body.mock = true;

    const headers: Record<string, string> = { ...stripAuthHeaders(options.headers) };
    if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;

    const res = await this.http.post(
      `/v1/capabilities/${encodeURIComponent(idOrSlug)}/execute`,
      body,
      { headers, ...(options.timeout !== undefined && { timeout: options.timeout }) }
    );
    return res.data as ExecuteCapabilityResponse;
  }

  /**
   * Fetch a capability run (`GET /v1/capabilities/capability-runs/:runId`) by the
   * id {@link CapabilitiesResource.run} returned. Poll this for its status and
   * `result`.
   *
   * `runs.get()` reads WORKFLOW runs (`/v1/workflow-runs/:id`) and answers 404
   * for a capability-run id; the underlying workflow run's id, when one exists,
   * is this run's `workflowRunId`.
   */
  async getRun(runId: string): Promise<Run> {
    const res = await this.http.get(
      `/v1/capabilities/capability-runs/${encodeURIComponent(runId)}`
    );
    const data = res.data;
    // Platform wraps as { run: {...} }; tolerate the unwrapped shape too.
    return (data && typeof data === 'object' && 'run' in data ? data.run : data) as Run;
  }

  /**
   * Follow a capability run's live events
   * (`GET /v1/capabilities/capability-runs/:runId/events`, Server-Sent Events):
   * every chunk its worker streams, in order, then one `end` event. A dropped
   * connection resumes from the last sequence received (`Last-Event-ID`), so no
   * chunk is delivered twice or skipped. Node.js only (it reads a response stream).
   *
   * ```ts
   * for await (const event of client.capabilities.runEvents(run.id)) {
   *   if (event.type === 'chunk') handle(event.chunks)
   *   else console.log('finished', event.status)
   * }
   * ```
   */
  async *runEvents(runId: string, options: RunEventsOptions = {}): AsyncGenerator<RunEvent> {
    let after = options.after ?? -1;
    const maxReconnects = options.maxReconnects ?? 5;
    let failures = 0;
    for (;;) {
      if (options.signal?.aborted) return;
      let ended = false;
      try {
        const res = await this.http.get(
          `/v1/capabilities/capability-runs/${encodeURIComponent(runId)}/events`,
          {
            responseType: 'stream',
            timeout: 0,
            headers: { Accept: 'text/event-stream', ...(after >= 0 ? { 'Last-Event-ID': String(after) } : {}) },
            ...(after >= 0 ? { params: { after } } : {}),
            ...(options.signal ? { signal: options.signal } : {}),
          }
        );
        const parser = new SseParser();
        const decoder = new TextDecoder();
        for await (const piece of res.data as AsyncIterable<Uint8Array | string>) {
          const text = typeof piece === 'string' ? piece : decoder.decode(piece, { stream: true });
          for (const event of parser.push(text)) {
            if (event.event === 'chunk') {
              const body = JSON.parse(event.data) as { seq: number; chunks: unknown[] };
              if (body.seq <= after) continue;
              after = body.seq;
              failures = 0;
              yield { type: 'chunk', seq: body.seq, chunks: Array.isArray(body.chunks) ? body.chunks : [] };
            } else if (event.event === 'end') {
              const body = JSON.parse(event.data) as { status: string };
              ended = true;
              yield { type: 'end', status: body.status };
              return;
            }
          }
        }
      } catch (error) {
        if (options.signal?.aborted) return;
        const status = error instanceof WhizuraiError ? error.status : undefined;
        // A definitive refusal (bad id, not yours, auth) is not retried.
        if (status !== undefined && status < 500 && status !== 408 && status !== 429) throw error;
        if (++failures > maxReconnects) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (failures - 1), 8000)));
        continue;
      }
      if (ended) return;
      // The server closed without an end event: reconnect from `after`.
      if (++failures > maxReconnects) {
        throw new WhizuraiError('Run event stream closed before the run ended', 'STREAM_CLOSED');
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (failures - 1), 8000)));
    }
  }

  /**
   * Cancel a capability run (`POST /v1/capabilities/capability-runs/:runId/cancel`).
   * Idempotent for an already-cancelled run. `runId` is the id returned by
   * {@link CapabilitiesResource.run}.
   *
   * Cancelling marks the run and cancels its workflow run best-effort. It does
   * not yet stop work already handed to a worker; that propagation is
   * platform-side.
   */
  async cancel(runId: string): Promise<CancelCapabilityRunResponse> {
    const res = await this.http.post(
      `/v1/capabilities/capability-runs/${encodeURIComponent(runId)}/cancel`
    );
    return res.data as CancelCapabilityRunResponse;
  }

  /** Validate inputs and estimate cost without executing. */
  async dryRun(idOrSlug: string, input: Record<string, unknown> = {}): Promise<DryRunResult> {
    const res = await this.http.post(
      `/v1/capabilities/${encodeURIComponent(idOrSlug)}/dry-run`,
      { input }
    );
    const data = (res.data ?? {}) as Partial<DryRunResult>;
    const valid =
      typeof data.valid === 'boolean'
        ? data.valid
        : data.status === 'valid' ||
          (Array.isArray(data.errors) && data.errors.length === 0 && data.status !== 'error');
    return { ...data, valid } as DryRunResult;
  }
}

/** Caller headers may add context (correlation ids) but never replace the client's credentials. */
function stripAuthHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'authorization' || lower === 'x-api-key') continue;
    out[name] = value;
  }
  return out;
}
