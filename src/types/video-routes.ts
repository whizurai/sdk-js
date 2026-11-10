/**
 * GET /v1/model-router/video-routes — the video route table.
 *
 * Which video models a requirements-routed request can land on, per route
 * tier. Mirrors `VideoRouteTable` in @whizurai/types and the openapi schema of
 * the same name (whizai-platform docs/api/video-routes.md).
 */

export type VideoRouteTier = 'standard' | 'directed';

/**
 * `automatic`: the router may choose it with no model named (production /
 * validated). `explicit`: only when the caller names it (candidate).
 */
export type VideoRouteReach = 'automatic' | 'explicit';

export interface VideoRouteTableEntry {
  /** Provider model id, e.g. `bytedance/seedance-2-5`. */
  model: string;
  routeTier: VideoRouteTier;
  lifecycle: 'candidate' | 'validated' | 'production';
  reach: VideoRouteReach;
}

export interface VideoRouteTierSummary {
  /** Chosen when only this tier can serve the shot; null when the tier has no automatic model. */
  defaultModel: string | null;
  automaticModels: string[];
}

export interface VideoRouteTable {
  /** Bumped when the shape or a field's meaning changes. Check it before trusting the rest. */
  version: 1;
  /** Tier preference, cheapest first. */
  tierOrder: VideoRouteTier[];
  tiers: Record<VideoRouteTier, VideoRouteTierSummary>;
  /** Every model a requirements-routed request can reach. Legacy and retired models are absent. */
  models: VideoRouteTableEntry[];
}
