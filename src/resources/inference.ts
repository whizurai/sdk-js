/**
 * Direct inference — `POST /v1/embeddings` and `POST /v1/rerank`.
 *
 * These are served by model-router, not the api-gateway at `baseUrl`, so they
 * use their own HTTP client bound to `inferenceBaseUrl`. model-router accepts
 * the same WhizAI API key (`X-API-Key` or `Authorization: Bearer`), which it
 * verifies with the gateway.
 *
 * Exposed as `client.embed()` / `client.rerank()`. Responses are returned in
 * their wire shape (snake_case), including the optional `whizai` provenance
 * block, so they line up with `@whizurai/types/inference`.
 */

import { AxiosInstance } from 'axios';
import { errorForStatus, ValidationError, WhizuraiError } from '../errors';
import { createHttpClient } from '../http-client';
import {
  DegradedRerankResponse,
  EmbedParams,
  EmbeddingsRequest,
  EmbeddingsResponse,
  RankedRerankResponse,
  RerankCallOptions,
  RerankOutcome,
  RerankParams,
  RerankRequest,
  RerankResponse,
} from '../types';

function requireModel(model: unknown, method: string): string {
  if (typeof model !== 'string' || model.trim() === '') {
    throw new ValidationError(
      `${method} requires an explicit \`model\` (e.g. 'embedding-qwen3-0.6b-v1'). ` +
        'There is no default: the vector space must be a deliberate choice.',
      'MODEL_REQUIRED'
    );
  }
  return model;
}

/**
 * Decide whether a rerank failure may degrade to original order.
 * Returns the reason string, or `null` if the error must be thrown.
 */
export function rerankDegradeReason(error: unknown): string | null {
  const e = error as { status?: number; code?: string; message?: string; response?: { status?: number } };
  const status = e?.status ?? e?.response?.status;
  if (typeof status === 'number') {
    if (status >= 500) return `http_${status}`;
    if (status === 408 || status === 429) return `http_${status}`;
    return null; // 400/401/403/404/422/... are caller bugs: always throw.
  }
  const code = e?.code ?? '';
  if (code === 'TIMEOUT' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(e?.message ?? '')) {
    return 'timeout';
  }
  // No HTTP status at all: the request never got an answer.
  return 'network_error';
}

export interface InferenceResourceConfig {
  apiKey: string;
  timeout: number;
  inferenceBaseUrl?: string;
}

export class InferenceResource {
  private _http?: AxiosInstance;

  constructor(private readonly config: InferenceResourceConfig) {}

  /** The model-router HTTP client; throws if `inferenceBaseUrl` is not configured. */
  private http(): AxiosInstance {
    if (this._http) return this._http;
    const baseUrl = this.config.inferenceBaseUrl;
    if (!baseUrl) {
      throw new WhizuraiError(
        'embed()/rerank() require `inferenceBaseUrl` (the model-router URL, e.g. ' +
          "'https://model-router.staging.whizur.ai'). The gateway `baseUrl` does not serve " +
          '/v1/embeddings or /v1/rerank.',
        'INFERENCE_BASE_URL_REQUIRED'
      );
    }
    this._http = createHttpClient({ apiKey: this.config.apiKey, baseUrl, timeout: this.config.timeout });
    return this._http;
  }

  /**
   * 401/403/404 from model-router usually mean the client points at the wrong
   * host (e.g. the gateway). Say so, keeping the error class and status.
   */
  private withConfigHint(error: unknown): unknown {
    const e = error as WhizuraiError;
    if (e instanceof WhizuraiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
      return errorForStatus(
        e.status,
        `${e.message} (check inferenceBaseUrl: ${this.config.inferenceBaseUrl})`,
        e.code,
        e.details
      );
    }
    return error;
  }

  private async post(path: string, body: unknown, config?: { timeout: number }): Promise<unknown> {
    const http = this.http();
    try {
      const res = await http.post(path, body, config);
      return res.data;
    } catch (error) {
      throw this.withConfigHint(error);
    }
  }

  /** Embed one or many strings. `model` is required. */
  async embed(params: EmbedParams): Promise<EmbeddingsResponse> {
    const body: EmbeddingsRequest = {
      model: requireModel(params?.model, 'embed()'),
      input: params.input,
    };
    if (params.inputType) body.input_type = params.inputType;
    if (params.instruction) body.instruction = params.instruction;

    return (await this.post('/v1/embeddings', body)) as EmbeddingsResponse;
  }

  /** Rerank `documents` against `query`. See {@link RerankCallOptions} for fallback mode. */
  async rerank(params: RerankParams, options: RerankCallOptions = {}): Promise<RerankOutcome> {
    const body: RerankRequest = {
      model: requireModel(params?.model, 'rerank()'),
      query: params.query,
      documents: params.documents,
    };
    if (params.topN !== undefined) body.top_n = params.topN;
    if (params.instruction) body.instruction = params.instruction;

    const config = options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : undefined;
    // Resolve the client first: a missing inferenceBaseUrl is a config bug and always throws.
    this.http();

    try {
      const data = (await this.post('/v1/rerank', body, config)) as RerankResponse;
      return { ...data, degraded: false } as RankedRerankResponse;
    } catch (error) {
      if (options.fallback !== 'original-order') throw error;
      const reason = rerankDegradeReason(error);
      if (reason === null) throw error;

      const documents = Array.isArray(params.documents) ? params.documents : [];
      const count =
        params.topN !== undefined && params.topN >= 0
          ? Math.min(params.topN, documents.length)
          : documents.length;
      const degraded: DegradedRerankResponse = {
        degraded: true,
        model: body.model,
        results: Array.from({ length: count }, (_, index) => ({ index, relevance_score: null })),
        reason,
        error: error instanceof Error ? error : new WhizuraiError(String(error), 'UNKNOWN'),
      };
      return degraded;
    }
  }
}
