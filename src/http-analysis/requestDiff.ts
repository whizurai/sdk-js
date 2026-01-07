/**
 * Request Diff Analysis
 * 
 * Compares two HTTP requests structurally and semantically:
 * - URL/path comparison
 * - Header diffs (added, removed, changed)
 * - Body diffs (structural JSON comparison)
 * - Query parameter diffs
 * - LLM-powered narrative summary
 */

import type { HttpRequestSnapshot } from '../http/types';

export interface RequestDiffResult {
  pathDiff: {
    before: string;
    after: string;
    changed: boolean;
  };
  headerDiff: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { before: string; after: string }>;
  };
  queryDiff: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { before: string; after: string }>;
  };
  bodyDiff: StructuralDiff | null;
  responseDiff: ResponseDiff | null;
  similarity: number; // 0-1
  narrative?: string; // LLM-generated explanation
}

export interface StructuralDiff {
  type: 'object' | 'array' | 'primitive' | 'type-change';
  before: any;
  after: any;
  changes: ChangedField[];
}

export interface ChangedField {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'type-changed';
  before?: any;
  after?: any;
}

export interface ResponseDiff {
  statusCodeChanged: boolean;
  beforeStatus: number;
  afterStatus: number;
  bodyDiff: StructuralDiff | null;
  headerDiff: {
    added: Record<string, string>;
    removed: Record<string, string>;
    changed: Record<string, { before: string; after: string }>;
  };
}

/**
 * Compare two HTTP requests
 */
export async function compareRequests(
  before: HttpRequestSnapshot,
  after: HttpRequestSnapshot,
  options?: {
    llmClient?: { complete: (prompt: string) => Promise<string> };
    includeResponse?: boolean;
  }
): Promise<RequestDiffResult> {
  const { llmClient, includeResponse = true } = options || {};

  // Parse URLs
  const beforeUrl = new URL(before.url, 'http://placeholder');
  const afterUrl = new URL(after.url, 'http://placeholder');

  // Path comparison
  const pathDiff = {
    before: beforeUrl.pathname,
    after: afterUrl.pathname,
    changed: beforeUrl.pathname !== afterUrl.pathname,
  };

  // Header comparison
  const headerDiff = compareObjects(before.headers, after.headers);

  // Query comparison
  const beforeQuery = Object.fromEntries(beforeUrl.searchParams);
  const afterQuery = Object.fromEntries(afterUrl.searchParams);
  const queryDiff = compareObjects(beforeQuery, afterQuery);

  // Body comparison
  const bodyDiff = compareBody(
    typeof before.body === 'string' ? before.body : JSON.stringify(before.body || ''),
    typeof after.body === 'string' ? after.body : JSON.stringify(after.body || '')
  );

  // Response comparison
  const responseDiff = includeResponse
    ? compareResponse(before, after)
    : null;

  // Calculate similarity
  const similarity = calculateSimilarity({
    pathDiff,
    headerDiff,
    queryDiff,
    bodyDiff,
    responseDiff,
  });

  // Generate LLM narrative
  let narrative: string | undefined;
  if (llmClient) {
    narrative = await generateDiffNarrative(
      { pathDiff, headerDiff, queryDiff, bodyDiff, responseDiff },
      llmClient
    );
  }

  return {
    pathDiff,
    headerDiff,
    queryDiff,
    bodyDiff,
    responseDiff,
    similarity,
    narrative: narrative ?? '',
  };
}

/**
 * Compare two objects (headers, query params, etc.)
 */
function compareObjects(
  before: Record<string, string> = {},
  after: Record<string, string> = {}
): {
  added: Record<string, string>;
  removed: Record<string, string>;
  changed: Record<string, { before: string; after: string }>;
} {
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: Record<string, { before: string; after: string }> = {};

  // Find added and changed
  for (const [key, afterValue] of Object.entries(after)) {
    if (!(key in before)) {
      added[key] = afterValue;
    } else if (before[key] !== afterValue) {
      changed[key] = { before: before[key], after: afterValue };
    }
  }

  // Find removed
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      removed[key] = before[key];
    }
  }

  return { added, removed, changed };
}

/**
 * Compare request bodies (structural diff)
 */
function compareBody(before: string, after: string): StructuralDiff | null {
  if (!before && !after) return null;
  if (!before || !after) {
    return {
      type: 'primitive',
      before,
      after,
      changes: [{ path: '$', type: before ? 'removed' : 'added', before, after }],
    };
  }

  // Try to parse as JSON
  let beforeObj: any;
  let afterObj: any;

  try {
    beforeObj = JSON.parse(before);
  } catch {
    beforeObj = before;
  }

  try {
    afterObj = JSON.parse(after);
  } catch {
    afterObj = after;
  }

  // Structural comparison
  return compareValues(beforeObj, afterObj, '$');
}

/**
 * Deep comparison of values
 */
function compareValues(before: any, after: any, path: string): StructuralDiff {
  const beforeType = getType(before);
  const afterType = getType(after);

  if (beforeType !== afterType) {
    return {
      type: 'type-change',
      before,
      after,
      changes: [{ path, type: 'type-changed', before, after }],
    };
  }

  if (beforeType === 'object') {
    return compareObjects2(before, after, path);
  }

  if (beforeType === 'array') {
    return compareArrays(before, after, path);
  }

  // Primitive comparison
  if (before === after) {
    return {
      type: 'primitive',
      before,
      after,
      changes: [],
    };
  }

  return {
    type: 'primitive',
    before,
    after,
    changes: [{ path, type: 'modified', before, after }],
  };
}

/**
 * Compare objects structurally
 */
function compareObjects2(before: any, after: any, path: string): StructuralDiff {
  const changes: ChangedField[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const newPath = `${path}.${key}`;
    const hasInBefore = key in before;
    const hasInAfter = key in after;

    if (!hasInBefore) {
      changes.push({ path: newPath, type: 'added', after: after[key] });
    } else if (!hasInAfter) {
      changes.push({ path: newPath, type: 'removed', before: before[key] });
    } else {
      const nestedDiff = compareValues(before[key], after[key], newPath);
      changes.push(...nestedDiff.changes);
    }
  }

  return {
    type: 'object',
    before,
    after,
    changes,
  };
}

/**
 * Compare arrays
 */
function compareArrays(before: any[], after: any[], path: string): StructuralDiff {
  const changes: ChangedField[] = [];

  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    const newPath = `${path}[${i}]`;
    if (i >= before.length) {
      changes.push({ path: newPath, type: 'added', after: after[i] });
    } else if (i >= after.length) {
      changes.push({ path: newPath, type: 'removed', before: before[i] });
    } else {
      const nestedDiff = compareValues(before[i], after[i], newPath);
      changes.push(...nestedDiff.changes);
    }
  }

  return {
    type: 'array',
    before,
    after,
    changes,
  };
}

/**
 * Compare responses
 */
function compareResponse(before: HttpRequestSnapshot, after: HttpRequestSnapshot): ResponseDiff {
  const beforeStatus = before.response?.statusCode || 0;
  const afterStatus = after.response?.statusCode || 0;

  return {
    statusCodeChanged: beforeStatus !== afterStatus,
    beforeStatus,
    afterStatus,
    bodyDiff: compareBody(
      typeof before.response?.body === 'string' ? before.response.body : JSON.stringify(before.response?.body || ''),
      typeof after.response?.body === 'string' ? after.response.body : JSON.stringify(after.response?.body || '')
    ),
    headerDiff: compareObjects(
      before.response?.headers || {},
      after.response?.headers || {}
    ),
  };
}

/**
 * Calculate overall similarity score (0-1)
 */
function calculateSimilarity(diff: Omit<RequestDiffResult, 'similarity' | 'narrative'>): number {
  let score = 1.0;

  // Path penalty
  if (diff.pathDiff.changed) score -= 0.2;

  // Header changes
  const headerChanges = Object.keys(diff.headerDiff.added).length +
    Object.keys(diff.headerDiff.removed).length +
    Object.keys(diff.headerDiff.changed).length;
  score -= Math.min(0.2, headerChanges * 0.02);

  // Query changes
  const queryChanges = Object.keys(diff.queryDiff.added).length +
    Object.keys(diff.queryDiff.removed).length +
    Object.keys(diff.queryDiff.changed).length;
  score -= Math.min(0.2, queryChanges * 0.03);

  // Body changes
  if (diff.bodyDiff) {
    score -= Math.min(0.3, diff.bodyDiff.changes.length * 0.05);
  }

  // Response changes
  if (diff.responseDiff) {
    if (diff.responseDiff.statusCodeChanged) score -= 0.1;
    if (diff.responseDiff.bodyDiff) {
      score -= Math.min(0.1, diff.responseDiff.bodyDiff.changes.length * 0.02);
    }
  }

  return Math.max(0, score);
}

/**
 * Generate LLM narrative of diff
 */
async function generateDiffNarrative(
  diff: Omit<RequestDiffResult, 'similarity' | 'narrative'>,
  llmClient: { complete: (prompt: string) => Promise<string> }
): Promise<string> {
  const prompt = `Compare these two HTTP requests and provide a concise summary of differences:

PATH: ${diff.pathDiff.before} → ${diff.pathDiff.after}

HEADER CHANGES:
- Added: ${Object.keys(diff.headerDiff.added).length}
- Removed: ${Object.keys(diff.headerDiff.removed).length}
- Modified: ${Object.keys(diff.headerDiff.changed).length}

BODY CHANGES:
${diff.bodyDiff ? `${diff.bodyDiff.changes.length} field changes` : 'No changes'}

${diff.responseDiff?.statusCodeChanged ? `RESPONSE STATUS: ${diff.responseDiff.beforeStatus} → ${diff.responseDiff.afterStatus}` : ''}

Provide a 2-3 sentence summary explaining what changed and why it might matter.`;

  try {
    return await llmClient.complete(prompt);
  } catch (error) {
    return 'Unable to generate summary';
  }
}

/**
 * Get value type
 */
function getType(value: any): 'object' | 'array' | 'primitive' {
  if (value === null || value === undefined) return 'primitive';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'primitive';
}
