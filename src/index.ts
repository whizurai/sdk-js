/**
 * Whizurai TypeScript/JavaScript SDK
 *
 * Official, capability-first SDK for the Whizurai Platform. The client exposes
 * exactly four resources — `capabilities`, `runs`, `artifacts`, `triggers` —
 * mirroring the platform's public REST surface (`/v1/capabilities/{id}/execute`,
 * `/v1/workflow-runs`, `/v1/artifacts`, `/v1/triggers`).
 *
 * @example
 * ```ts
 * import { WhizuraiClient } from '@whizurai/sdk-js';
 *
 * const client = new WhizuraiClient({ apiKey: process.env.WHIZURAI_API_KEY! });
 *
 * const { run } = await client.capabilities.run('image.generate', {
 *   prompt: 'a red bicycle',
 * });
 * const done = await client.runs.pollUntilDone(run.id);
 * const artifacts = await client.runs.artifacts(done.id);
 * ```
 */

import { AxiosInstance } from 'axios';
import { createHttpClient, DEFAULT_BASE_URL, SDK_VERSION } from './http-client';
import { CapabilitiesResource } from './resources/capabilities';
import { RunsResource } from './resources/runs';
import { ArtifactsResource } from './resources/artifacts';
import { TriggersResource } from './resources/triggers';
import { InferenceResource } from './resources/inference';
import {
  EmbedParams,
  EmbeddingsResponse,
  HealthResponse,
  RankedRerankResponse,
  RerankCallOptions,
  RerankOutcome,
  RerankParams,
  StatusResponse,
  WhizuraiConfig,
} from './types';

export class WhizuraiClient {
  /** Execute and inspect capabilities. */
  readonly capabilities: CapabilitiesResource;
  /** Track capability runs and poll them to completion. */
  readonly runs: RunsResource;
  /** List and fetch run artifacts. */
  readonly artifacts: ArtifactsResource;
  /** Manage event-driven triggers. */
  readonly triggers: TriggersResource;

  private readonly _http: AxiosInstance;
  private readonly _inference: InferenceResource;
  private readonly _config: Required<WhizuraiConfig>;

  constructor(config: WhizuraiConfig) {
    if (!config?.apiKey) {
      throw new Error('WhizuraiClient requires an `apiKey`.');
    }
    this._config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      timeout: config.timeout ?? 30_000,
    };

    this._http = createHttpClient(this._config);
    this.capabilities = new CapabilitiesResource(this._http);
    this.runs = new RunsResource(this._http);
    this.artifacts = new ArtifactsResource(this._http);
    this.triggers = new TriggersResource(this._http);
    this._inference = new InferenceResource(this._http);
  }

  /**
   * Embed text (`POST /v1/embeddings`). `model` is required — there is no
   * default, so the vector space is always a deliberate choice. The response
   * carries `whizai.embedding_space`; compare vectors only within one space
   * (see {@link assertSameEmbeddingSpace}).
   */
  embed(params: EmbedParams): Promise<EmbeddingsResponse> {
    return this._inference.embed(params);
  }

  /**
   * Rerank documents against a query (`POST /v1/rerank`).
   *
   * With `{ fallback: 'original-order' }` this never throws on timeout,
   * network error, 408/429 or 5xx: it resolves with `degraded: true` and the
   * documents in their original order. Other 4xx errors always throw.
   */
  rerank(params: RerankParams, options: RerankCallOptions & { fallback: 'original-order' }): Promise<RerankOutcome>;
  rerank(params: RerankParams, options?: RerankCallOptions & { fallback?: undefined }): Promise<RankedRerankResponse>;
  rerank(params: RerankParams, options?: RerankCallOptions): Promise<RerankOutcome>;
  rerank(params: RerankParams, options: RerankCallOptions = {}): Promise<RerankOutcome> {
    return this._inference.rerank(params, options);
  }

  /** Unauthenticated gateway health check (`GET /health`). */
  async health(): Promise<HealthResponse> {
    const res = await this._http.get('/health');
    return res.data as HealthResponse;
  }

  /** Lightweight platform status (`GET /v1/status`). */
  async status(): Promise<StatusResponse> {
    const res = await this._http.get('/v1/status');
    return res.data as StatusResponse;
  }
}

/** Factory helper mirroring `new WhizuraiClient(config)`. */
export function createClient(config: WhizuraiConfig): WhizuraiClient {
  return new WhizuraiClient(config);
}

export const VERSION = SDK_VERSION;

export default WhizuraiClient;

// Resource classes (for advanced typing / extension).
export { CapabilitiesResource } from './resources/capabilities';
export { RunsResource } from './resources/runs';
export type { ListRunsOptions } from './resources/runs';
export { ArtifactsResource } from './resources/artifacts';
export type { ListArtifactsOptions } from './resources/artifacts';
export { TriggersResource } from './resources/triggers';
export { InferenceResource, rerankDegradeReason } from './resources/inference';

// Embedding-space guard.
export {
  assertSameEmbeddingSpace,
  embeddingSpaceOf,
  EmbeddingSpaceError,
} from './embedding-space';
export type { EmbeddingSpaceSource } from './embedding-space';
export {
  RECOMMENDED_EMBEDDING_MODEL,
  RECOMMENDED_RERANK_MODEL,
  EMBEDDINGS_MAX_INPUTS,
  RERANK_MAX_DOCUMENTS,
} from './types/inference';

// Errors.
export * from './errors';

// Types.
export type * from './types';

// Mock API builder module (developer tooling).
export * from './mock';
