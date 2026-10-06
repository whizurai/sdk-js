/**
 * Direct inference: embeddings, rerank and chat completions.
 *
 * Wire shapes for the model-router public endpoints `POST /v1/embeddings`,
 * `POST /v1/rerank` and `POST /v1/chat/completions`. Field names are kept exactly as they appear on the wire
 * (snake_case) so these types can be used to type raw responses.
 *
 * Provenance (`whizai`) is optional everywhere: older, non-fleet embedding
 * models (e.g. `nomic-embed-text`) answer without it, and every field inside
 * it may be absent on a given deployment. Treat a missing `embedding_space`
 * as "not comparable with anything", never as a wildcard.
 *
 * Mirrors `@whizurai/types/inference`; keep the two in lockstep.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Pinned alias for the recommended fleet embedding model. */
export const RECOMMENDED_EMBEDDING_MODEL = 'embedding-qwen3-0.6b-v1';

/** Pinned alias for the recommended fleet rerank model. */
export const RECOMMENDED_RERANK_MODEL = 'rerank-qwen3-0.6b-v1';

/** Maximum number of inputs accepted by a single `POST /v1/embeddings` call. */
export const EMBEDDINGS_MAX_INPUTS = 128;

/** Maximum number of documents accepted by a single `POST /v1/rerank` call. */
export const RERANK_MAX_DOCUMENTS = 64;

// =============================================================================
// SHARED
// =============================================================================

/** Token usage, when the runtime reports it. */
export interface InferenceUsage {
  prompt_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

/** The worker that executed a request, when the gateway can attribute it. */
export interface InferenceWorker {
  id: string;
  name: string;
}

/**
 * Execution attribution common to embeddings and rerank responses.
 * Every field is optional because attribution coverage differs per runtime.
 */
export interface InferenceProvenance {
  /** Provider adapter that served the request (e.g. `spark`, `ollama`). */
  provider?: string;
  /** Serving runtime (e.g. `vllm`, `tensorfold`, `ollama`). */
  runtime?: string;
  /** Where it executed (e.g. `local`, `cloud`). */
  execution?: string;
  /** Worker identity, or `null`/absent when not attributable. */
  worker?: InferenceWorker | null;
  /** Resolved model id (the alias target, not the alias). */
  model?: string;
  /** Exact model revision, or `null` when the runtime cannot report one. */
  model_revision?: string | null;
  /** Prompt/instruction contract the server applied (e.g. `qwen3-embed-instruct-v1`). */
  prompt_contract?: string;
  /** `false` when the gateway could not establish which worker/model served the request. */
  attributable?: boolean;
}

// =============================================================================
// EMBEDDINGS — POST /v1/embeddings
// =============================================================================

/** Whether the inputs are search queries or documents being indexed. */
export type EmbeddingInputType = 'query' | 'document';

export interface EmbeddingsRequest {
  /** Model id or pinned alias. Required: the vector space is always a deliberate choice. */
  model: string;
  /** One string or up to {@link EMBEDDINGS_MAX_INPUTS} strings. */
  input: string | string[];
  /** Default `document`. Instruction-tuned models embed queries differently. */
  input_type?: EmbeddingInputType;
  /** Optional task instruction (only applied to `query` inputs by instruct models). */
  instruction?: string;
}

export interface EmbeddingData {
  object: 'embedding';
  /** Position of the corresponding input. */
  index: number;
  embedding: number[];
}

export interface EmbeddingProvenance extends InferenceProvenance {
  /** Vector dimensionality. */
  dimensions?: number;
  /** Whether vectors are L2-normalized (cosine == dot product). */
  normalized?: boolean;
  /**
   * Identity of the vector space, e.g.
   * `qwen3-embedding-0.6b:97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3:1024:normalized:qwen3-embed-instruct-v1`
   * (`model:revision:dimensions:normalization:prompt_contract`).
   *
   * Vectors are only comparable when their `embedding_space` strings are
   * identical. Absent on older, non-fleet models.
   */
  embedding_space?: string;
}

export interface EmbeddingsResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage?: InferenceUsage | null;
  whizai?: EmbeddingProvenance;
}

// =============================================================================
// RERANK — POST /v1/rerank
// =============================================================================

export interface RerankRequest {
  /** Model id or pinned alias. */
  model: string;
  query: string;
  /** 1..{@link RERANK_MAX_DOCUMENTS} documents. */
  documents: string[];
  /** Return only the best `top_n` results. */
  top_n?: number;
  /** Optional task instruction. */
  instruction?: string;
}

export interface RerankResult {
  /** Position of the document in the request's `documents`. */
  index: number;
  relevance_score: number;
}

/** Rerank provenance (includes `attributable`). */
export type RerankProvenance = InferenceProvenance;

export interface RerankResponse {
  id: string;
  model: string;
  /** Sorted by `relevance_score`, descending. */
  results: RerankResult[];
  usage?: InferenceUsage | null;
  whizai?: RerankProvenance;
}

// =============================================================================
// SDK CALL SHAPES (camelCase params, mapped to the wire by the client)
// =============================================================================

/** Parameters for {@link WhizuraiClient.embed}. */
export interface EmbedParams {
  /** Model id or pinned alias (e.g. `embedding-qwen3-0.6b-v1`). Required — no default. */
  model: string;
  input: string | string[];
  /**
   * `query` for retrieval queries, `document` (server default) for passages
   * being indexed. Instruction-tuned models (Qwen3-Embedding) only apply the
   * query instruction to `query` inputs — embedding a query as a document
   * silently degrades retrieval.
   */
  inputType?: EmbeddingInputType;
  instruction?: string;
}

/** Parameters for {@link WhizuraiClient.rerank}. */
export interface RerankParams {
  /** Model id or pinned alias (e.g. `rerank-qwen3-0.6b-v1`). Required — no default. */
  model: string;
  query: string;
  documents: string[];
  topN?: number;
  instruction?: string;
}

/** Per-call options for {@link WhizuraiClient.rerank}. */
export interface RerankCallOptions {
  /**
   * `original-order`: on timeout, network error, 408, 429 or 5xx, resolve with
   * the documents in their original order instead of throwing. Validation and
   * auth errors (other 4xx) still throw — they are caller bugs.
   */
  fallback?: 'original-order';
  /** Request timeout for this call, in ms. Defaults to the client timeout. */
  timeoutMs?: number;
}

/** A successful rerank. */
export interface RankedRerankResponse extends RerankResponse {
  degraded: false;
}

/** A rerank that fell back to original order. Never thrown; check `degraded`. */
export interface DegradedRerankResponse {
  degraded: true;
  model: string;
  /** Original order: `index` 0..n-1 (truncated to `topN` when given), no score. */
  results: Array<{ index: number; relevance_score: null }>;
  /** Short machine-readable reason: `timeout`, `network_error`, or `http_<status>`. */
  reason: string;
  /** The underlying error, for logging. */
  error: Error;
}

export type RerankOutcome = RankedRerankResponse | DegradedRerankResponse;

// =============================================================================
// CHAT COMPLETIONS — POST /v1/chat/completions
// =============================================================================
//
// OpenAI-compatible, served by model-router (`ChatCompletionRequest` /
// `ChatCompletionResponse` in services/model-router/src/models.py). Unlike
// embeddings/rerank there is no `whizai` block: attribution rides in
// `execution` (body) and the `x-whizai-*` response headers.

/** Pinned capability alias for grounded JSON extraction. */
export const STRUCTURED_EXTRACTION_MODEL = 'structured-extraction';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** An OpenAI-style tool call on an assistant turn. */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  [key: string]: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  /** Absent on an assistant turn that only calls tools. */
  content?: string | null;
  tool_calls?: ChatToolCall[] | null;
  /** Which tool call a `role: 'tool'` message answers. */
  tool_call_id?: string | null;
  /** Tool name, for `role: 'tool'` messages. */
  name?: string | null;
}

/** JSON-schema-constrained output (OpenAI `response_format.type = 'json_schema'`). */
export interface ChatJsonSchemaFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
    description?: string;
  };
}

/** Forwarded verbatim to the runtime. */
export type ChatResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | ChatJsonSchemaFormat;

/** Thinking control, forwarded verbatim. `'none'` turns thinking off for extraction. */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | (string & {});

/** model-router `ProviderType`; pins execution to a provider (fails closed if unavailable). */
export type ChatProvider =
  | 'openai'
  | 'fal'
  | 'ollama'
  | 'vllm'
  | 'replicate'
  | 'anthropic'
  | 'mistral'
  | 'gemini'
  | 'mock'
  | 'kling'
  | 'kieai'
  | (string & {});

/** Wire request body. Non-streaming only: `client.chat()` never sends `stream: true`. */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** 0..2. Server default 0.7. */
  temperature?: number;
  max_tokens?: number;
  /** 0..1. Server default 1.0. */
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: false;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  reasoning_effort?: ReasoningEffort;
  chat_template_kwargs?: Record<string, unknown>;
  response_format?: ChatResponseFormat;
  user?: string;
  project_id?: string;
  request_id?: string;
  provider?: ChatProvider;
  metadata?: Record<string, unknown>;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  /** `stop`, `length`, `tool_calls`, ... */
  finish_reason?: string | null;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

/** One failed attempt before the one that answered (ADR 0013). */
export interface ChatResolutionAttempt {
  model?: string;
  workerName?: string;
  outcome?: string;
  [key: string]: unknown;
}

/**
 * How the requested name became the model that ran (alias -> family -> model -> worker).
 * Present only when the request was resolved through the fleet.
 */
export interface ChatResolution {
  requested?: string;
  alias?: string;
  aliasVersion?: string | number;
  capability?: string;
  family?: string;
  /** `registry` or `worker-declared`. */
  classification?: string;
  declaredBy?: string;
  model?: string;
  traitsApplied?: string[];
  attempt?: number;
  previousAttempts?: ChatResolutionAttempt[];
  worker?: InferenceWorker | null;
  [key: string]: unknown;
}

/**
 * Execution attribution, carried verbatim from the provider. Absent means
 * unattributed — never infer a tier from its absence.
 */
export interface ChatExecution {
  provider?: string;
  /** `fleet` when a fleet worker ran it. */
  execution?: string;
  fleet_job_id?: string;
  /** Runtime that produced it (`vllm`, `sglang`, `ollama`, ...). */
  runtime?: string;
  execution_policy?: string;
  resolution?: ChatResolution;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion' | (string & {});
  created: number;
  /** The concrete model id that generated the answer (not the alias). */
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatUsage;
  /** Routing family (e.g. `ollama`, `vllm`) — not the machine. */
  provider?: ChatProvider | null;
  execution?: ChatExecution | null;
  request_id?: string | null;
}

/** model-router execution policy, sent as `x-execution-policy`. */
export type ExecutionPolicy = 'fleet-required' | 'fleet-preferred' | 'fleet-disabled';

/** Parameters for {@link WhizuraiClient.chat} (camelCase, mapped to the wire). */
export interface ChatParams {
  /** Capability alias (e.g. `structured-extraction`) or model id. Required — no default. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  tools?: Array<Record<string, unknown>>;
  toolChoice?: ChatCompletionRequest['tool_choice'];
  /** e.g. `'none'` to disable thinking on extraction calls. */
  reasoningEffort?: ReasoningEffort;
  /** e.g. `{ enable_thinking: false }`. */
  chatTemplateKwargs?: Record<string, unknown>;
  responseFormat?: ChatResponseFormat;
  user?: string;
  projectId?: string;
  requestId?: string;
  /** Pin to a provider; an unavailable provider fails closed instead of being substituted. */
  provider?: ChatProvider;
  metadata?: Record<string, unknown>;
}

/** Per-call options for {@link WhizuraiClient.chat}. */
export interface ChatCallOptions {
  /**
   * Sent as `x-execution-policy`. `fleet-required` never leaves the fleet: when
   * nothing serves the alias the call rejects (503 `no_capable_model`) instead
   * of falling back.
   */
  executionPolicy?: ExecutionPolicy;
  /** Sent as `x-priority` (e.g. `interactive`, `batch`); the gateway checks it against the app's policy. */
  priority?: string;
  /** Request timeout for this call, in ms. Defaults to the client timeout. */
  timeoutMs?: number;
}
