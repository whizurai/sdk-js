/**
 * Outcome runs — run a published outcome by slug, poll it, read its assets.
 *
 *   POST /v1/outcomes/{slug}/runs        → RunOutcomeResponse (202 new, 200 idempotent replay)
 *   GET  /v1/outcomes/runs/{id}          → GetOutcomeRunResponse
 *   GET  /v1/outcomes/runs/{id}/assets   → OutcomeRunAssetsResponse
 *   GET  /v1/outcomes/{slug}/runs        → ListOutcomeRunsResponse
 *
 * Mirrors `@whizurai/types/outcomes` 1.7.0, whizai-platform
 * apps/api-gateway/src/routes/v1/outcomes.ts and the
 * `OutcomeRun*` schemas in docs/api/openapi.yaml.
 */

/** Prisma `OutcomeRunStatus`. Nothing sets `CANCELLED` today; it is terminal if it appears. */
export type OutcomeRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/** Statuses at which an outcome run is finished and will not change further. */
export const TERMINAL_OUTCOME_RUN_STATUSES: readonly OutcomeRunStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

/** Body of `POST /v1/outcomes/{slug}/runs`. */
export interface RunOutcomeRequest {
  /** Keyed by the outcome's unlocked `fieldKey`s. */
  inputs: Record<string, unknown>;
  /** Defaults to the API key's app. */
  appId?: string;
  /** Variant slug; omitted runs the default variant. */
  variant?: string;
  /** 1–255 chars. The same key with the same inputs replays the run (200); with other inputs, 409 IDEMPOTENCY_CONFLICT. */
  idempotencyKey?: string;
  customerId?: string;
}

/** `outcomeRun` of the create response. */
export interface OutcomeRunHandle {
  id: string;
  status: OutcomeRunStatus;
  outcomeSlug: string;
  outcomeVersion: string;
  variantSlug: string | null;
  estimatedACU: number | null;
  /** ISO-8601. */
  startedAt: string;
  /** Relative path to poll, `/v1/outcomes/runs/{id}`. */
  statusUrl: string;
}

export interface RunOutcomeResponse {
  outcomeRun: OutcomeRunHandle;
}

/** `outcomeRun` of `GET /v1/outcomes/runs/{id}`. */
export interface OutcomeRun {
  id: string;
  status: OutcomeRunStatus;
  outcomeSlug: string;
  outcomeVersion: string;
  variantSlug: string | null;
  /** Variant-merged inputs the run executed with. */
  inputs: Record<string, unknown>;
  /** Assembled by the worker on completion; null until then. */
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  errorCode: string | null;
  estimatedACU: number | null;
  /** Populated on completion. */
  acuConsumed: number | null;
  /** ISO-8601. */
  startedAt: string;
  /** ISO-8601; null until terminal. */
  completedAt: string | null;
}

export interface GetOutcomeRunResponse {
  outcomeRun: OutcomeRun;
}

/** One delivered asset (an ACTIVE artifact linked to the run), oldest first. */
export interface OutcomeRunAsset {
  id: string;
  /** Artifact contract type, e.g. `image.generated`. */
  type: string;
  storageRef: string;
  metadata: Record<string, unknown> | null;
  tags: string[];
  /** ISO-8601. */
  createdAt: string;
}

export interface OutcomeRunAssetsResponse {
  assets: OutcomeRunAsset[];
}

/** One row of `GET /v1/outcomes/{slug}/runs` (newest first). */
export interface OutcomeRunSummary {
  id: string;
  status: OutcomeRunStatus;
  outcomeSlug: string;
  outcomeVersion: string;
  variantSlug: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  estimatedACU: number | null;
  acuConsumed: number | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  /** First image asset, for thumbnails. */
  previewArtifact: { id: string; type: string; storageRef: string } | null;
}

/** Query of `GET /v1/outcomes/{slug}/runs`. */
export interface ListOutcomeRunsQuery {
  /** 1–100, default 20. */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
}

export interface ListOutcomeRunsResponse {
  runs: OutcomeRunSummary[];
  nextCursor: string | null;
}

/** Error codes the create route returns, with their HTTP status. */
export type RunOutcomeErrorCode =
  | 'INVALID_INPUT' // 400
  | 'INVALID_VARIANT' // 400
  | 'UNAUTHENTICATED' // 401
  | 'INSUFFICIENT_BALANCE' // 402, details.purchase
  | 'OUTCOME_NOT_FOUND' // 404
  | 'BILLING_NOT_PROVISIONED' // 409
  | 'IDEMPOTENCY_CONFLICT' // 409
  | 'INTERNAL_ERROR'; // 500

/** Error body of every outcome route. */
export interface OutcomeErrorResponse {
  /** A `RunOutcomeErrorCode`, `OUTCOME_RUN_NOT_FOUND` on the read routes, or another code. */
  error: string;
  message: string;
  details?: Record<string, unknown> & {
    /** INSUFFICIENT_BALANCE only: where to add ACU. */
    purchase?: { url: string; canSelfServe: boolean };
  };
}
