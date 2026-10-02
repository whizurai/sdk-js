/**
 * Direct inference — `POST /v1/embeddings` and `POST /v1/rerank`.
 *
 * Exposed as `client.embed()` / `client.rerank()`. Responses are returned in
 * their wire shape (snake_case), including the optional `whizai` provenance
 * block, so they line up with `@whizurai/types/inference`.
 */

import { AxiosInstance } from 'axios';
import { ValidationError, WhizuraiError } from '../errors';
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

export class InferenceResource {
  constructor(private readonly http: AxiosInstance) {}

  /** Embed one or many strings. `model` is required. */
  async embed(params: EmbedParams): Promise<EmbeddingsResponse> {
    const body: EmbeddingsRequest = {
      model: requireModel(params?.model, 'embed()'),
      input: params.input,
    };
    if (params.inputType) body.input_type = params.inputType;
    if (params.instruction) body.instruction = params.instruction;

    const res = await this.http.post('/v1/embeddings', body);
    return res.data as EmbeddingsResponse;
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

    try {
      const res = await this.http.post('/v1/rerank', body, config);
      const data = res.data as RerankResponse;
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
