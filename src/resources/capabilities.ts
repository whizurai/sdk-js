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
  RunCapabilityOptions,
} from '../types';

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
    if (options.webhookUrl) body.webhookUrl = options.webhookUrl;
    if (options.routing) body.routing = options.routing;
    if (options.metadata) body.metadata = options.metadata;

    const headers: Record<string, string> = {};
    if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;

    const res = await this.http.post(
      `/v1/capabilities/${encodeURIComponent(idOrSlug)}/execute`,
      body,
      { headers }
    );
    return res.data as ExecuteCapabilityResponse;
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
