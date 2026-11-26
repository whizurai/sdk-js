/**
 * GET /v1/model-router/catalog — the model catalogue.
 *
 * Every model a caller may pass as `model`, per operation, with the
 * operation's default. Mirrors `ModelCatalog` in @whizurai/types and the
 * openapi schemas `ModelCatalog` / `CatalogModel` (whizai-platform
 * docs/model-catalog.md). The same list fills the `model` input of
 * catalogue-backed capabilities (`image:generate`, `image:edit`), so a model
 * listed here is one a run accepts.
 */

/** Operations the catalogue covers. Text and vision join when their capabilities take a `model`. */
export type CatalogOperation = 'image_generate' | 'image_edit';

/** Retired models are absent from the catalogue; naming one is refused with `model_not_available`. */
export type CatalogLifecycle = 'validated' | 'candidate';

/** `automatic`: may be the operation's default (validated). `explicit`: runs only when named (candidate). */
export type CatalogReach = 'automatic' | 'explicit';

export type CatalogQuality = 'draft' | 'standard' | 'premium';

export type CatalogProvider = 'openai' | 'kieai' | 'fleet';

export interface CatalogPrice {
  /** What one `usd` buys. */
  unit: 'image' | 'mtok_in' | 'none';
  /** Provider price at the default size and quality the route sends. 0 with unit `none` is local compute. */
  usd: number;
  /** Day the price was read from `source` (YYYY-MM-DD). */
  pricedAt: string;
  source: string;
  /** Anything that changes the price (resolution, quality). */
  note?: string;
}

export interface CatalogModel {
  /** What callers pass as `model`. Stable; never reused for a different model. */
  id: string;
  label: string;
  provider: CatalogProvider;
  lifecycle: CatalogLifecycle;
  reach: CatalogReach;
  quality: CatalogQuality;
  price: CatalogPrice;
  limits?: {
    /** Reference images an edit accepts beyond the base image. */
    maxReferenceImages?: number;
  };
  notes?: string;
}

export interface CatalogOperationView {
  operation: CatalogOperation;
  /** The model used when a run names none. */
  default: string;
  models: CatalogModel[];
}

export interface ModelCatalog {
  /** Catalogue revision, e.g. `2026-11-25.1`. */
  version: string;
  operations: CatalogOperationView[];
}
