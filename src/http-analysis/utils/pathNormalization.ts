/**
 * Path Normalization Utilities
 * 
 * Converts concrete API paths into normalized templates:
 * - /users/123 → /users/{id}
 * - /orders/abc-def-123/items → /orders/{orderId}/items
 * - /v1/products/SKU-12345 → /v1/products/{sku}
 * 
 * Used for grouping similar requests to infer API endpoint schemas.
 */

/**
 * Path segment type classification
 */
export type SegmentType = 'static' | 'uuid' | 'numeric' | 'alphanumeric' | 'custom';

/**
 * Normalized path segment
 */
export interface NormalizedSegment {
  original: string;
  normalized: string;
  type: SegmentType;
  paramName?: string;
}

/**
 * Normalized path result
 */
export interface NormalizedPath {
  original: string;
  normalized: string;
  segments: NormalizedSegment[];
  paramCount: number;
}

/**
 * Path normalization options
 */
export interface PathNormalizationOptions {
  /** Minimum segment length to consider for normalization (default: 3) */
  minSegmentLength?: number;
  /** Custom param naming function */
  paramNamer?: (segment: string, index: number, type: SegmentType) => string;
  /** Whether to preserve query strings (default: false) */
  preserveQuery?: boolean;
}

/**
 * UUID pattern (v4)
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Common ID patterns
 */
const NUMERIC_ID_PATTERN = /^\d+$/;
const ALPHANUMERIC_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const HASH_PATTERN = /^[a-f0-9]{20,64}$/i;

/**
 * Common static segments that should never be normalized
 */
const STATIC_SEGMENTS = new Set([
  'api', 'v1', 'v2', 'v3', 'admin', 'public', 'internal',
  'users', 'orders', 'products', 'items', 'accounts', 'customers',
  'payments', 'invoices', 'subscriptions', 'webhooks', 'events',
  'search', 'create', 'update', 'delete', 'list', 'get',
  'health', 'status', 'metrics', 'docs', 'swagger',
]);

/**
 * Classify a path segment
 */
function classifySegment(segment: string, minLength: number = 3): SegmentType {
  // Always treat short segments as static
  if (segment.length < minLength) {
    return 'static';
  }

  // Check if it's a known static segment
  if (STATIC_SEGMENTS.has(segment.toLowerCase())) {
    return 'static';
  }

  // Check for UUID
  if (UUID_PATTERN.test(segment)) {
    return 'uuid';
  }

  // Check for numeric ID
  if (NUMERIC_ID_PATTERN.test(segment)) {
    return 'numeric';
  }

  // Check for hash (SHA, MD5, etc.)
  if (HASH_PATTERN.test(segment)) {
    return 'custom';
  }

  // Check for alphanumeric ID (product codes, slugs, etc.)
  if (ALPHANUMERIC_ID_PATTERN.test(segment) && segment.length >= minLength) {
    return 'alphanumeric';
  }

  return 'static';
}

/**
 * Generate a parameter name for a segment
 */
function generateParamName(
  segment: string,
  index: number,
  type: SegmentType,
  previousSegment?: string
): string {
  // Use previous segment as context (e.g., /users/{id} → "userId")
  if (previousSegment && previousSegment !== 'api' && !previousSegment.startsWith('v')) {
    const singularized = previousSegment.replace(/s$/, ''); // Remove plural 's'
    return `${singularized}Id`;
  }

  // Fallback based on type
  switch (type) {
    case 'uuid':
      return 'id';
    case 'numeric':
      return 'id';
    case 'alphanumeric':
      return segment.includes('-') ? 'slug' : 'id';
    case 'custom':
      return 'hash';
    default:
      return `param${index}`;
  }
}

/**
 * Normalize a single path
 */
export function normalizePath(
  path: string,
  options: PathNormalizationOptions = {}
): NormalizedPath {
  const {
    minSegmentLength = 3,
    paramNamer,
    preserveQuery = false,
  } = options;

  // Remove query string unless preserving
  let cleanPath = path;
  let queryString = '';
  if (path.includes('?')) {
    [cleanPath, queryString] = path.split('?');
  }

  // Split into segments
  const segments = cleanPath.split('/').filter(s => s.length > 0);
  const normalizedSegments: NormalizedSegment[] = [];
  let paramCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const type = classifySegment(segment, minSegmentLength);

    if (type === 'static') {
      normalizedSegments.push({
        original: segment,
        normalized: segment,
        type,
      });
    } else {
      // This is a dynamic segment
      const previousSegment = i > 0 ? segments[i - 1] : undefined;
      const paramName = paramNamer
        ? paramNamer(segment, i, type)
        : generateParamName(segment, i, type, previousSegment);

      normalizedSegments.push({
        original: segment,
        normalized: `{${paramName}}`,
        type,
        paramName,
      });
      paramCount++;
    }
  }

  const normalizedPath = '/' + normalizedSegments.map(s => s.normalized).join('/');
  const fullNormalizedPath = preserveQuery && queryString
    ? `${normalizedPath}?${queryString}`
    : normalizedPath;

  return {
    original: path,
    normalized: fullNormalizedPath,
    segments: normalizedSegments,
    paramCount,
  };
}

/**
 * Normalize multiple paths and group by normalized form
 */
export function normalizeAndGroupPaths(
  paths: string[],
  options: PathNormalizationOptions = {}
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const path of paths) {
    const normalized = normalizePath(path, options);
    const existing = grouped.get(normalized.normalized) || [];
    existing.push(path);
    grouped.set(normalized.normalized, existing);
  }

  return grouped;
}

/**
 * Extract parameter values from a concrete path given a normalized template
 */
export function extractPathParams(
  concretePath: string,
  normalizedPath: string
): Record<string, string> {
  const concreteSegments = concretePath.split('/').filter(s => s.length > 0);
  const normalizedSegments = normalizedPath.split('/').filter(s => s.length > 0);

  if (concreteSegments.length !== normalizedSegments.length) {
    return {};
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < normalizedSegments.length; i++) {
    const normalized = normalizedSegments[i];
    const concrete = concreteSegments[i];

    // Check if this segment is a parameter (e.g., {id})
    const match = normalized.match(/^\{(.+)\}$/);
    if (match) {
      const paramName = match[1];
      params[paramName] = concrete;
    }
  }

  return params;
}

/**
 * Check if a path matches a normalized template
 */
export function pathMatchesTemplate(
  concretePath: string,
  normalizedPath: string,
  options: PathNormalizationOptions = {}
): boolean {
  const normalized = normalizePath(concretePath, options);
  return normalized.normalized === normalizedPath;
}

/**
 * Merge multiple normalized paths to find common pattern
 * Useful when you have slight variations and want to find the most general template
 */
export function mergePaths(paths: string[]): string {
  if (paths.length === 0) return '/';
  if (paths.length === 1) return normalizePath(paths[0]).normalized;

  // Normalize all paths
  const normalized = paths.map(p => normalizePath(p));

  // Find the path with the most parameters (most general)
  const mostGeneral = normalized.reduce((prev, curr) =>
    curr.paramCount > prev.paramCount ? curr : prev
  );

  return mostGeneral.normalized;
}
