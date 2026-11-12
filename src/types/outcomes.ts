/**
 * Outcome runs — run a published outcome by slug, poll it, read its assets.
 *
 *   POST /v1/outcomes/{slug}/runs        → RunOutcomeResponse (202 new, 200 idempotent replay)
 *   GET  /v1/outcomes/runs/{id}          → GetOutcomeRunResponse
 *   GET  /v1/outcomes/runs/{id}/assets   → OutcomeRunAssetsResponse
 *   GET  /v1/outcomes/{slug}/runs        → ListOutcomeRunsResponse
 *
 * Interactive item runs (an outcome with `outputDefaults.interactive`; platform doc
 * whizai-platform docs/interactive-outcome-runs.md):
 *
 *   GET  /v1/outcomes/runs/{id}/workspace                       → InteractiveWorkspace
 *   POST /v1/outcomes/runs/{id}/commands                        → InteractiveCommandResponse (202 applied, 200 replay)
 *   GET  /v1/outcomes/runs/{id}/invocations/{invocationId}      → InteractiveInvocationDetail
 *   GET  /v1/outcomes/runs/{id}/events                          → OutcomeRunEventsResponse
 *
 * Mirrors `@whizurai/types/outcomes` 1.9.0, whizai-platform
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
  /**
   * The app the run belongs to (id or public appId); it decides per-app policy such as the
   * image provider pin. An app-bound key always runs as its own app (another one: 403
   * APP_MISMATCH); a named app must be the caller's (else 404 APP_NOT_FOUND). Defaults to the
   * API key's app.
   */
  appId?: string;
  /** Variant slug; omitted runs the default variant. */
  variant?: string;
  /** 1–255 chars. The same key with the same inputs replays the run (200); with other inputs, 409 IDEMPOTENCY_CONFLICT. */
  idempotencyKey?: string;
  customerId?: string;
  /**
   * `review` (Review as you go) authorizes only the first operation; every later invocation
   * needs a command (`POST /v1/outcomes/runs/{id}/commands`). Omitted or `automatic`: all work
   * runs within the reservation.
   */
  executionPolicy?: OutcomeExecutionPolicy;
}

/** How much of a run is authorized up front. */
export type OutcomeExecutionPolicy = 'automatic' | 'review';

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
  /** True for an interactive item run; read `GET /v1/outcomes/runs/{id}/workspace` for its state. */
  interactive?: boolean;
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
  | 'APP_MISMATCH' // 403, an app-bound API key named a different appId
  | 'OUTCOME_NOT_FOUND' // 404
  | 'APP_NOT_FOUND' // 404, appId unknown or not the caller's
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

// ---------------------------------------------------------------------------
// Interactive item runs
//
// Mirrors whizai-platform packages/capabilities/src/interactive/commands.ts
// (`InteractiveCommand`, `CommandResult`), interactive/workspace.ts
// (`describeWorkspace`, the single source of the workspace shape) and the
// interactive routes in apps/api-gateway/src/routes/v1/outcomes.ts.
// ---------------------------------------------------------------------------

/** A new revision of a description (`slot: 'description'`) or a run input (`itemId: ''`, `slot: 'input:<fieldKey>'`). */
export interface ApplyEditCommand {
  action: 'apply_edit';
  /** Item id, or `''` for a run input. */
  itemId: string;
  /** `description`, or `input:<fieldKey>` for a run input. */
  slot: string;
  /** The slot's current chosen revision. */
  expectedRevisionId: string;
  fields: Record<string, string>;
  /** Return the affected scope (`result.preview.affected`) without applying. */
  preview?: boolean;
}

/** Choose (or keep) a revision. Choosing a revision that is itself out of date is refused. */
export interface ChooseVersionCommand {
  action: 'choose_version';
  itemId: string;
  slot: string;
  revisionId: string;
  /** The slot's current choice, or null when nothing is chosen. */
  expectedRevisionId: string | null;
  preview?: boolean;
}

export interface GenerateTarget {
  itemId: string;
  /** The exact revision the stage must consume. */
  sourceRevisionId?: string;
}

/** Authorize exactly the listed targets for one stage, or `assemble`. */
export interface GenerateCommand {
  action: 'generate';
  /** A stage key (e.g. `image`, `clip`) or `assemble`. */
  operation: string;
  targets: GenerateTarget[];
  /** Choose `sourceRevisionId` first ("Use this image and generate video"). */
  chooseSource?: boolean;
  /** A new candidate; the current choice is kept. */
  tryAnother?: boolean;
  /** For `assemble`, the exact ordered clips. */
  expectedSourceRevisionIds?: string[];
}

/** One-shot repair of one item's description; returns a candidate. */
export interface RegenerateItemCommand {
  action: 'regenerate_item';
  itemId: string;
  expectedRevisionId: string;
  /** At most 1000 chars. */
  instructions?: string;
}

/** A full alternative plan, as a candidate. */
export interface RegeneratePlanCommand {
  action: 'regenerate_plan';
}

/** Replace the plan with a candidate; starts a new manifest and reuses no media. */
export interface ReplacePlanCommand {
  action: 'replace_plan';
  planRevisionId: string;
  expectedControlRevision: number;
}

/** A bounded grant over the current items: reuse current choices, generate the rest, assemble. */
export interface FinishRemainingCommand {
  action: 'finish_remaining';
  expectedControlRevision: number;
  /** Cap for this authorization; must cover the estimate (else 400 BUDGET_BELOW_ESTIMATE). */
  budgetAcu?: number;
  /** Return the scope and estimate (`result.preview`, an `InteractiveRemainingWork`) without authorizing. */
  preview?: boolean;
}

/** Revoke automatic grants (`pause`) or everything (`cancel`). Submitted work still settles. */
export interface PauseOrCancelCommand {
  action: 'pause' | 'cancel';
  expectedControlRevision?: number;
}

/** A new attempt for a failed invocation with unchanged inputs. */
export interface RetryCommand {
  action: 'retry';
  invocationId: string;
  /** Required when the failed attempt's acceptance is unknown (409 ACKNOWLEDGE_UNCERTAIN otherwise). */
  acknowledgeUncertain?: boolean;
}

/** One interactive command; `action` selects the shape. */
export type InteractiveCommand =
  | ApplyEditCommand
  | ChooseVersionCommand
  | GenerateCommand
  | RegenerateItemCommand
  | RegeneratePlanCommand
  | ReplacePlanCommand
  | FinishRemainingCommand
  | PauseOrCancelCommand
  | RetryCommand;

export type InteractiveCommandAction = InteractiveCommand['action'];

/** Body of `POST /v1/outcomes/runs/{id}/commands`. */
export interface InteractiveCommandRequest {
  /**
   * Idempotency key, 8–200 chars. Required unless `command.preview` is true. Replaying it
   * returns the original result (200); reusing it with a different command is 409
   * ACTION_KEY_REUSED.
   */
  clientActionId?: string;
  command: InteractiveCommand;
}

/** A chosen revision that a command made out of date. */
export interface InteractiveStaleSlot {
  itemId: string;
  slot: string;
  revisionId: string;
  reason: string;
}

/** `result` of a command response. */
export interface InteractiveCommandResult {
  controlRevision: number;
  invocationIds: string[];
  /** Invocations an identical earlier authorization already created. */
  reusedInvocationIds: string[];
  newlyOutOfDate: InteractiveStaleSlot[];
  cancelledInvocationIds: string[];
  /** Submitted work whose inputs changed; it may still finish and be charged. */
  inFlightAffected: string[];
  grantId?: string;
  revisionId?: string;
  /**
   * Only for `preview: true`: `{ affected: InteractiveStaleSlot[] }` for `apply_edit` /
   * `choose_version`, an `InteractiveRemainingWork` for `finish_remaining`.
   */
  preview?: { affected: InteractiveStaleSlot[] } | InteractiveRemainingWork | Record<string, unknown>;
  /** True when this is the stored result of an earlier command with the same `clientActionId`. */
  replayed?: boolean;
  /** True when the command queued work. */
  dispatch: boolean;
}

/** Response of `POST /v1/outcomes/runs/{id}/commands` (202 applied, 200 replay). */
export interface InteractiveCommandResponse {
  result: InteractiveCommandResult;
  workspace: InteractiveWorkspace;
}

/** Error codes the command route returns, with their HTTP status. */
export type InteractiveCommandErrorCode =
  | 'INVALID_INPUT' // 400
  | 'INVALID_OPERATION' // 400
  | 'NO_CHANGE' // 400
  | 'BUDGET_BELOW_ESTIMATE' // 400
  | 'UNAUTHENTICATED' // 401
  | 'INSUFFICIENT_BALANCE' // 402
  | 'BUDGET_EXHAUSTED' // 402
  | 'OUTCOME_RUN_NOT_FOUND' // 404, also another caller's run
  | 'NOT_FOUND' // 404, a revision outside this run
  | 'STATE_CHANGED' // 409
  | 'REVISION_OUT_OF_DATE' // 409
  | 'PREREQUISITE_MISSING' // 409
  | 'RETRY_REQUIRED' // 409
  | 'ACKNOWLEDGE_UNCERTAIN' // 409
  | 'ACTION_KEY_REUSED' // 409
  | 'GRANT_INACTIVE' // 409
  | 'RUN_TERMINAL' // 409
  | 'OUTCOME_RESERVATION_UNAVAILABLE' // 409
  | 'NOT_INTERACTIVE'; // 409, a graph-walk run

/** Error body of the command route: the current workspace rides along when the run could be read. */
export interface InteractiveCommandErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
  workspace?: InteractiveWorkspace;
}

/** One immutable revision of a slot. */
export interface InteractiveRevisionView {
  id: string;
  number: number;
  kind: string;
  content: unknown;
  asset: { url: string; sha256: string | null; bytes: number | null; mimeType: string | null } | null;
  provenance: string;
  producedByInvocationId: string | null;
  /** Derivation history only (what a repair started from). */
  baseRevisionId: string | null;
  /** Live dependencies that decide freshness. */
  inputRevisionIds: string[];
  /** ISO-8601. */
  createdAt: string;
  /** False when a live dependency is no longer chosen or current. */
  current: boolean;
  staleReason: string | null;
  chosen: boolean;
}

/** Invocation lifecycle state. */
export type InteractiveInvocationState =
  | 'queued'
  | 'submitting'
  | 'running'
  | 'reconciling'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** One logical unit of work (one attempt). */
export interface InteractiveInvocationView {
  id: string;
  operation: string;
  /** `''` for run-level work (plan, assembly). */
  itemId: string;
  generation: number;
  attempt: number;
  state: InteractiveInvocationState;
  stateLabel: string;
  inputRevisionIds: string[];
  baseRevisionId: string | null;
  outputRevisionIds: string[];
  estimateAcu: number | null;
  actualAcu: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  actor: { type: string | null; id: string | null };
  grantId: string | null;
  retryOfId: string | null;
  createdAt: string;
  submittedAt: string | null;
  completedAt: string | null;
}

/** The next action on a slot, with its estimate or the reason it is unavailable. */
export interface InteractiveActionView {
  operation: string;
  label: string;
  enabled: boolean;
  reason: string | null;
  estimateAcu: number;
  sourceRevisionId: string | null;
}

/** Selection decision for a slot. `default_first` is a highlighted first result, never human approval. */
export type InteractiveSelectionDecision = 'kept' | 'selected' | 'default_first' | 'accepted_by_policy';

/** One slot (a run input, an item description, an item stage, or the assembly). */
export interface InteractiveSlotView {
  slot: string;
  label: string;
  /** Human status, e.g. `Not generated`, `Running`, `Out of date`, `Ready to review · new candidate`. */
  status: string;
  chosen: InteractiveRevisionView | null;
  decision: InteractiveSelectionDecision | null;
  /** `<actorType>` or `<actorType>:<actorId>`. */
  decisionActor: string | null;
  selectionRevisionId: string | null;
  /** Newest first. */
  versions: InteractiveRevisionView[];
  active: InteractiveInvocationView | null;
  lastFailure: InteractiveInvocationView | null;
  next: InteractiveActionView | null;
  tryAnother: InteractiveActionView | null;
}

export interface InteractiveItemView {
  id: string;
  position: number;
  /** 1-based story order. */
  number: number;
  label: string;
  description: InteractiveSlotView;
  /** One per declared stage, in stage order. */
  stages: InteractiveSlotView[];
}

/** What `finish_remaining` would do over the current items. */
export interface InteractiveRemainingWork {
  reuse: Array<{ itemId: string; slot: string; revisionId: string; number: number }>;
  /** Units to generate, per operation. */
  generate: Record<string, number>;
  inProgress: Array<{ itemId: string; operation: string; invocationId: string }>;
  blocked: Array<{ itemId: string; operation: string; reason: string }>;
  estimateAcu: number;
  /** Units of work still to finish inside the scope (new + in progress). */
  pending: number;
}

/** `GET /v1/outcomes/runs/{id}/workspace` — server-derived state of an interactive run. */
export interface InteractiveWorkspace {
  runId: string;
  status: OutcomeRunStatus;
  mode: OutcomeExecutionPolicy;
  /** Send as `expectedControlRevision` on run-level commands. */
  controlRevision: number;
  manifestRevision: number;
  paused: boolean;
  definition: { slug: string; version: string };
  collection: { itemLabel: string; size: number; fields: unknown };
  stages: Array<{ key: string; label: string; kind: string; estimateAcu: number }>;
  /** Mixed-state summary, e.g. `2 clips running · 3 clips ready · 1 shot awaiting review`. */
  summary: string;
  spend: {
    incurredAcu: number;
    outstandingAcu: number;
    committedAcu: number;
    reservedAcu: number | null;
    reservationStatus: string | null;
    automaticCapAcu: number | null;
  };
  /** The idea and shared inputs, as slots `input:<fieldKey>` with `itemId: ''`. */
  inputs: InteractiveSlotView[];
  plan: {
    chosen: InteractiveRevisionView | null;
    candidates: InteractiveRevisionView[];
    active: InteractiveInvocationView | null;
    lastFailure: InteractiveInvocationView | null;
    estimateAcu: number;
  };
  /** In story order. */
  items: InteractiveItemView[];
  assembly: InteractiveSlotView & {
    readyCount: number;
    requiredCount: number;
    blocker: string | null;
    /** Send as `expectedSourceRevisionIds` with `generate` `assemble`. */
    expectedSourceRevisionIds: string[] | null;
    next: InteractiveActionView;
  };
  /** Null until the plan has produced items. */
  finishRemaining: (InteractiveRemainingWork & { enabled: boolean; reason: string | null }) | null;
  automatic: { grantId: string; kind: string; budgetAcu: number | null; scope: unknown } | null;
  invocations: InteractiveInvocationView[];
  /** The run's result once SUCCEEDED; null otherwise. */
  result: unknown;
}

/** A revision as the invocation inspector describes it. */
export interface InteractiveInvocationRevisionRef {
  id: string;
  /** Present (true) only when the revision could not be read. */
  unavailable?: true;
  itemId?: string;
  slot?: string;
  number?: number;
  sha256?: string | null;
  /** Signed parameters replaced with `[redacted]`. */
  url?: string | null;
  /** Text and JSON revisions only. */
  content?: unknown;
}

/** Whether the provider accepted the attempt. */
export type InteractiveInvocationAcceptance =
  | 'not_submitted'
  | 'submitted'
  | 'provider_accepted_or_running'
  | 'acceptance_unknown';

/** One workflow step of an invocation, as submitted. */
export interface InteractiveInvocationStep {
  stepId: string;
  stepType: string;
  status: string;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  /** What the workflow handed the step after its input mapping. */
  stepInput: unknown;
  /** What the step reports it sent to its provider or tool, when it records it. */
  submittedRequest: unknown;
  /** The served model, when the step reports it. */
  resolvedModel: string | null;
  output: unknown;
}

/** `GET /v1/outcomes/runs/{id}/invocations/{invocationId}`. Credentials and signed URL parameters are `[redacted]`. */
export interface InteractiveInvocationDetail {
  invocation: InteractiveInvocationView;
  /** The exact source revisions, with content hashes. */
  sources: InteractiveInvocationRevisionRef[];
  /** The derivation base, for a repair. */
  base: InteractiveInvocationRevisionRef | null;
  outputs: InteractiveInvocationRevisionRef[];
  /** The capability input Whiz resolved from the chosen revisions. */
  resolvedByWhiz: unknown;
  capabilityRun: {
    id: string;
    status: string;
    workflowRunId: string | null;
    capabilityVersionId: string | null;
    durationMs: number | null;
    errorMessage: string | null;
  } | null;
  acceptance: InteractiveInvocationAcceptance;
  steps: InteractiveInvocationStep[];
  cost: { estimatedAcu: number | null; actualAcu: number | null; actualCostCents: number | null } | null;
  fingerprint: string;
}

/** One entry of the durable trail (edits, choices, grants, dispatch, late completions, pause, cancel). */
export interface OutcomeRunEvent {
  id: string;
  outcomeRunId: string;
  type: string;
  actorType: string;
  actorId: string | null;
  itemId: string | null;
  data: Record<string, unknown> | null;
  /** ISO-8601. */
  createdAt: string;
}

/** `GET /v1/outcomes/runs/{id}/events`, oldest first, at most 1000. */
export interface OutcomeRunEventsResponse {
  events: OutcomeRunEvent[];
}
