/**
 * Canonical types for the Whizurai capability-first SDK.
 *
 * The platform's public surface is capability-first: you list/execute
 * capabilities, track their runs, and read the resulting artifacts. The
 * low-level workflow-authoring surface is intentionally NOT exposed here.
 */

// ─── Client configuration ──────────────────────────────────────────────────

export interface WhizuraiConfig {
  /** API key (sk_live_… / sk_test_…). Sent as `X-API-Key` and `Authorization: Bearer`. */
  apiKey: string;
  /** Base URL of the platform gateway. Defaults to https://api.whizurai.com */
  baseUrl?: string;
  /** Per-request timeout in ms. Default: 30_000 */
  timeout?: number;
}

// ─── Run lifecycle ─────────────────────────────────────────────────────────

export type RunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Statuses at which a run is finished and will not change further. */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  'succeeded',
  'completed',
  'failed',
  'cancelled',
];

// ── Run presentation ─────────────────────────────────────────────────────────

/**
 * What a produced value IS. Open on purpose: an unrecognised value must degrade
 * gracefully rather than break a client, so treat this as a string with known
 * members, not a closed union.
 */
export type SemanticOutputType =
  | 'text' | 'markdown' | 'object' | 'collection'
  | 'image' | 'video' | 'audio' | 'file' | 'unknown'
  | (string & {});

export interface PresentedOutput {
  /** Stable identity: the capability output's `source`, else the result key. */
  key: string;
  label: string;
  semanticType: SemanticOutputType;
  /** Inline value for text | markdown | object | collection. */
  value?: unknown;
  /** The inline value was clipped at the API boundary. */
  truncated?: boolean;
  /** Storage URL for media and files. Not pre-proxied. */
  href?: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Set when a durable artifact backs this output. */
  artifactId?: string;
  itemType?: SemanticOutputType;
  itemCount?: number;
  items?: PresentedOutput[];
  /** JSON Schema from the output declaration, when present. */
  schema?: Record<string, unknown>;
}

export interface PresentedInput {
  key: string;
  label: string;
  semanticType?: string;
  value?: unknown;
  href?: string;
  mimeType?: string;
}

export interface PresentedAction {
  /** copy | download | open | play | view_raw | save_as_asset | reuse | continuation */
  id: string;
  label: string;
  outputKey?: string;
  primary?: boolean;
  /** continuation only: the capability that can consume this result. */
  capabilitySlug?: string;
}

/**
 * Derived read model for a run's result. Present only when the platform has the
 * feature enabled and the run succeeded; never persisted, recomputed per
 * request from the run's canonical `result` plus its capability's declarations.
 *
 * `source` is the honesty field: `declared` means the values came from the
 * workflow's declared outputs. `inferred` means a compatibility adapter
 * reconstructed them for a run predating the canonical-result contract.
 */
export interface RunPresentation {
  contractVersion: 1;
  source: 'declared' | 'inferred' | 'none';
  /**
   * The run's customer-facing name, taken verbatim from the capability's
   * `name`.
   *
   * ABSENT when the run has no capability. A workflow-only run has no human
   * name anywhere, and formatting `workflowSlug` would substitute a guess for a
   * fact — fall back to the slug instead.
   */
  title?: string;
  primary: PresentedOutput | null;
  secondary: PresentedOutput[];
  /** Outputs declared role=debug. Inspection surface only. */
  debug: PresentedOutput[];
  inputs: PresentedInput[];
  actions: PresentedAction[];
}

export interface Run {
  id: string;
  /** Underlying workflow run ID, when surfaced by the platform. */
  workflowRunId?: string;
  capabilityId?: string;
  capabilitySlug?: string;
  status: RunStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  result?: Record<string, unknown>;
  artifacts?: Artifact[];
  artifactRefs?: { images?: string[]; videos?: string[]; json?: string[] };
  error?: { message: string; code?: string };
  errorMessage?: string;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  /** Derived result read model. Absent when the platform has it disabled. */
  presentation?: RunPresentation;
}

export interface ListRunsResponse {
  runs: Run[];
  total?: number;
  nextCursor?: string | null;
}

export interface RunLogEntry {
  level?: string;
  message: string;
  timestamp?: string;
  stepId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Artifacts ─────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  type: string;
  name?: string;
  filename?: string;
  url?: string;
  previewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  runId?: string;
  stepId?: string;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ListArtifactsResponse {
  artifacts: Artifact[];
  /** Number of artifacts in this page (mirrors the platform `count`). */
  total?: number;
  count?: number;
}

// ─── Capabilities ──────────────────────────────────────────────────────────

export type CapabilityStatus = 'draft' | 'published' | 'deprecated';

export interface CapabilityInputField {
  name: string;
  type: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  schema?: Record<string, unknown>;
}

export interface Capability {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  status: CapabilityStatus;
  version: string;
  inputContract?: CapabilityInputField[];
  /** Legacy/optional flat JSON Schema for inputs. */
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListCapabilitiesResponse {
  capabilities: Capability[];
  total?: number;
  nextCursor?: string | null;
}

export interface ListCapabilitiesOptions {
  status?: CapabilityStatus;
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface RunCapabilityOptions {
  /** Reuse a previous run if the same key was used before. */
  idempotencyKey?: string;
  /** Webhook URL called when the run completes. */
  webhookUrl?: string;
  /** Provider/model routing overrides. */
  routing?: { provider?: string; model?: string };
  metadata?: Record<string, string>;
}

export interface ExecuteCapabilityResponse {
  run: Run;
}

export interface DryRunResult {
  valid: boolean;
  status?: 'valid' | 'warning' | 'error' | string;
  resolvedInputs?: Record<string, unknown>;
  resolvedArtifacts?: Record<string, unknown>;
  estimatedCost?: number;
  warnings?: unknown[];
  errors?: unknown[];
}

// ─── Triggers ──────────────────────────────────────────────────────────────

export interface Trigger {
  id: string;
  appId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  eventType: string;
  filters?: Record<string, unknown>;
  actionType: string;
  actionConfig?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListTriggersResponse {
  triggers: Trigger[];
  count: number;
}

export interface ListTriggersOptions {
  appId?: string;
  enabled?: boolean;
}

export interface CreateTriggerInput {
  name: string;
  eventType: string;
  actionType: string;
  actionConfig: Record<string, unknown>;
  description?: string;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export type UpdateTriggerInput = Partial<Omit<CreateTriggerInput, 'name'>> & {
  name?: string;
};

export interface TriggerTestResult {
  success: boolean;
  [key: string]: unknown;
}

// ─── Polling ───────────────────────────────────────────────────────────────

export interface PollOptions {
  /** Polling interval in ms. Default: 2000 */
  interval?: number;
  /** Overall timeout in ms. Default: 600_000 (10 min) */
  timeout?: number;
  onUpdate?: (run: Run) => void;
}

// ─── Health / status ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime?: number;
  version?: string;
  checks?: Record<string, unknown>;
}

export interface StatusResponse {
  status: string;
  version: string;
  timestamp: string;
}

// Capability-specific typed shapes.
export * from './video-multi-shot';
