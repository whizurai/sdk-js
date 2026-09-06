/**
 * `video:multi-shot@v1` — typed request/response shapes.
 *
 * The capability generates ONE continuous video from an ordered list of shots,
 * optionally holding named subjects consistent across every shot. It is not
 * several clips stitched together, and it is billed as one task.
 *
 * These shapes are provider-neutral. Nothing here names a model or a provider's
 * field vocabulary — a caller that writes provider reference syntax into a shot
 * prompt has leaked the provider into product code, and will break the first
 * time routing picks a different one.
 */

/** Capability slug, for `client.capabilities.run(...)`. */
export const VIDEO_MULTI_SHOT = 'video:multi-shot' as const;

/**
 * One shot of a multi-shot generation.
 *
 * Array order IS shot order, all the way to the provider. Nothing re-sorts it.
 */
export interface VideoShot {
  /**
   * What happens in this shot. May address a registered subject by its bare
   * `token` (e.g. `hero_pet`); the platform applies provider syntax.
   */
  prompt: string;
  /** Length of this shot in seconds. */
  durationSeconds: number;
}

/** A named subject whose identity must survive the whole generation. */
export interface SubjectReference {
  /** How shot prompts address this subject, e.g. `hero_pet`. */
  token: string;
  /** Short factual description of the subject. */
  description?: string;
  /**
   * Images establishing this subject's appearance. The routed model declares
   * how many it needs (Kling 3.0 requires 2–4) and the platform refuses an
   * out-of-range set before the task is billed.
   */
  imageUrls: string[];
}

/** Input for `video:multi-shot@v1`. */
export interface VideoMultiShotInput {
  /** The frame the sequence opens on. Optional. */
  startImageUrl?: string;
  /** Ordered shots. At least one; the routed model declares the maximum. */
  shots: VideoShot[];
  /** Named subjects to keep consistent across shots. */
  subjectReferences?: SubjectReference[];
  /** Output shape, e.g. `16:9`, `9:16`, `1:1`. */
  aspectRatio?: string;
  /** Output resolution tier, e.g. `720p`. */
  resolution?: string;
  /** Generate audio with the video. Defaults to false. */
  audio?: boolean;
}

/** Output of `video:multi-shot@v1`. */
export interface VideoMultiShotOutput {
  /** The single sequenced video. */
  video: string;
}

/**
 * Seconds the request will bill for: the sum of the shot durations.
 *
 * Providers bill per second of generated output, so this is the number that
 * decides cost — not the shot count.
 */
export function totalDurationSeconds(shots: readonly VideoShot[]): number {
  return shots.reduce((total, shot) => total + shot.durationSeconds, 0);
}
