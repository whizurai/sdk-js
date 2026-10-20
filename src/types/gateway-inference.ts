/**
 * Synchronous inference through the api-gateway: text generation and image
 * description.
 *
 * Wire shapes for `POST /v1/generate/text` and `POST /v1/images/describe` on
 * the api-gateway (`https://api.<env>.whizur.ai`), as opposed to the
 * model-router endpoints in `./inference`. The gateway authenticates the key,
 * takes the app and tenant from it (never from the body), applies AI rate
 * limits, and leases the work on the fleet under that app's policy.
 *
 * Field names are exactly as they appear on the wire: camelCase requests, and
 * responses as the gateway returns them.
 *
 * Mirrors `@whizurai/types/gateway-inference`; keep the two in lockstep.
 */

// =============================================================================
// SHARED
// =============================================================================

import type { ExecutionPolicy } from './inference';

/**
 * Fleet scheduling class. `interactive` is for work a person is waiting on, and
 * only for apps whose fleet policy grants it (otherwise 403
 * `admission_not_permitted`).
 */
export type PriorityClass = 'interactive' | 'production' | 'batch' | 'backfill';

// `ExecutionPolicy` is shared with chat(): see ./inference.

/**
 * Thinking control the gateway accepts. `none` turns reasoning off on a
 * thinking model (GLM-5.3).
 */
export type GatewayReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * Request metadata the gateway forwards. Any other key, including app or
 * customer identity, is dropped: identity comes from the API key.
 */
export interface GatewayRequestMetadata {
  priority?: PriorityClass;
  /** Deadline for the fleet job. The job is cancelled when it passes. */
  timeoutMs?: number;
  idempotencyKey?: string;
  executionPolicy?: ExecutionPolicy;
}

// =============================================================================
// TEXT — POST /v1/generate/text
// =============================================================================

export interface GenerateTextRequest {
  prompt: string;
  /**
   * A capability alias (`chat`, `structured-extraction`, ...) or a model id.
   * Omitted, it is `chat` on the local fleet, `fleet-required`.
   */
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  reasoningEffort?: GatewayReasoningEffort;
  metadata?: GatewayRequestMetadata;
}

/**
 * Where a text request executed. Absent means unattributed: do not infer a
 * tier from its absence.
 */
export interface GenerateTextExecution {
  execution?: 'fleet' | 'direct' | string;
  runtime?: string;
  fleet_job_id?: string;
  [key: string]: unknown;
}

export interface GenerateTextChoice {
  text: string;
  index: number;
  /** The runtime's reason; `length` means the answer was truncated. */
  finish_reason: string;
}

export interface GenerateTextResponse {
  id: string;
  object: 'text_completion';
  created: number;
  /** The model that served the request, not necessarily the one requested. */
  model: string;
  provider?: string;
  choices: GenerateTextChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  execution?: GenerateTextExecution;
}

// =============================================================================
// IMAGE DESCRIPTION — POST /v1/images/describe
// =============================================================================

/**
 * Open-ended image understanding. Send exactly one of `image` (base64 bytes)
 * or `imageUrl` (public http(s); private and loopback addresses are refused).
 * The bytes must be JPEG, PNG, GIF or WEBP, at most 20 MiB.
 *
 * Use this rather than the `image:describe` capability when the caller needs a
 * synchronous answer about the exact bytes it holds (a URL can re-resolve to
 * different bytes).
 */
export interface DescribeImageRequest {
  image?: string;
  imageUrl?: string;
  /** What to ask about the image. Defaults to a general description. */
  prompt?: string;
  /**
   * The exact model to run, routed to whichever fleet worker holds it.
   * Omitted, the platform's `vision` alias runs.
   */
  model?: string;
  provider?: string;
  detail?: 'low' | 'high' | 'auto';
  /** Default 1024. */
  maxTokens?: number;
  /** Default 0.2. */
  temperature?: number;
  requestId?: string;
  metadata?: GatewayRequestMetadata;
}

export interface DescribeImageResponse {
  description: string;
  /** Provider adapter that served the request (e.g. `ollama`). */
  provider: string;
  /** The model that served the request. */
  model: string;
  requestId: string;
  /** Wall-clock seconds. */
  responseTime: number;
  usage?: Record<string, number>;
  /** Execution attribution (endpoint, runtime, fleet job, worker) where known. */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// SDK CALL OPTIONS
// =============================================================================

/** Transport options for `generateText()` / `describeImage()`. Never sent as model input. */
export interface GatewayCallOptions {
  /**
   * Client-side HTTP timeout for this call (default: the client's `timeout`).
   * Set it above `metadata.timeoutMs`, so the fleet's named deadline error
   * arrives before the socket gives up.
   */
  timeoutMs?: number;
}
