/**
 * Image Generate Capability Types
 *
 * Platform capability `image:generate@v4`: images from a prompt. Run it with
 * `client.capabilities.run(IMAGE_GENERATE, input)`; the images are artifacts.
 * Mirrors `ImageGenerateInput` in the platform's `docs/api/openapi.yaml`; the
 * fleet contract is `docs/using-imagegen-fleet.md` in the platform repo.
 *
 * The reference image (v4) is honoured only where the calling app's images run
 * on the local fleet. There the render STARTS from the reference (img2img on the
 * served model, denoise = 1 - strength): a new picture that borrows the
 * reference's palette, light and mood (~0.3) or its composition (~0.6). It is
 * not an edit. Anywhere else a reference is refused by name, never ignored, and
 * a run whose runtime did not confirm the reference fails
 * `imagegen/reference_not_applied`.
 *
 * @module @whizurai/types/capabilities/image-generate
 */

/** Capability slug, for `client.capabilities.run(...)`. */
export const IMAGE_GENERATE = 'image:generate' as const;

/** The sizes the capability offers. On the fleet the PNG is exactly this size, never snapped. */
export type ImageGenerateSize = '1024x1024' | '1024x1792' | '1792x1024' | '512x512' | '256x256';

/** Content types accepted for `referenceImageBase64`. */
export type ImageGenerateReferenceContentType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Input for `image:generate@v4`. Unknown fields are rejected. */
export interface ImageGenerateInput {
  /** 1-2000 characters. */
  prompt: string;
  size?: ImageGenerateSize;
  /** `hd` is refused on the fleet (it has no meaning for a pinned local model). */
  quality?: 'standard' | 'hd';
  /** 1-4 images. On the fleet they render one after another. */
  n?: number;
  /** 0 to 4294967295. Omitted: one is chosen and reported on the result. */
  seed?: number;
  model?: string;
  provider?: string;

  /**
   * Reference image, ONE of the three sources below, always with `referenceStrength`.
   * An http(s) link the platform copies into its own storage.
   */
  referenceImageUrl?: string;
  /** An image artifact owned by the calling app. */
  referenceImageArtifactId?: string;
  /** Base64 of a PNG, JPEG or WebP, at most 8 MiB decoded. Needs `referenceImageContentType`. */
  referenceImageBase64?: string;
  referenceImageContentType?: ImageGenerateReferenceContentType;
  /** 0.05-0.95: how much of the reference survives. Required with a reference. */
  referenceStrength?: number;
}

/**
 * What a referenced image started from, as the executing runtime reported it: the
 * sha256 of the reference bytes and the strength applied. Found on the image
 * artifact's `metadata.reference` and `metadata.attribution[i].reference`; `null`
 * there means the request carried no reference.
 */
export interface ImageGenerateReference {
  sha256: string;
  strength: number;
}
