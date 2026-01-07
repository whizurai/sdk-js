/**
 * Smart Replay Variant Generator
 * Generates test variations of HTTP requests (boundary, fuzzy, security, etc.)
 */

import type { LLMClient } from '../ai/llmClient';
import type {
  HttpRequestSnapshot,
  ReplayVariant,
  ReplayMode,
  ReplayOptions,
} from './types';
import { applyRedaction } from './utils/redaction';

/**
 * Generate replay variants for a base HTTP request
 */
export async function generateReplayVariants(
  base: HttpRequestSnapshot,
  mode: ReplayMode,
  options?: ReplayOptions,
  llmClient?: LLMClient
): Promise<ReplayVariant[]> {
  // Apply redaction before any AI processing
  const { snapshot: redactedBase } = applyRedaction(base);

  // Generate variants based on mode
  switch (mode) {
    case 'boundary':
      return generateBoundaryVariants(redactedBase, options);
    case 'fuzzy':
      return generateFuzzyVariants(redactedBase, options);
    case 'security':
      return generateSecurityVariants(redactedBase, options);
    case 'load':
      return generateLoadVariants(redactedBase, options);
    case 'divergence':
      return await generateDivergenceVariants(redactedBase, options, llmClient);
    default:
      throw new Error(`Unknown replay mode: ${mode}`);
  }
}

/**
 * Generate boundary test variants (null, empty, min/max values)
 */
function generateBoundaryVariants(
  base: HttpRequestSnapshot,
  options?: ReplayOptions
): ReplayVariant[] {
  const variants: ReplayVariant[] = [];
  const count = options?.variantCount || 10;
  let variantNumber = 0;

  // Parse body if JSON
  let bodyObj: any = base.body;
  if (typeof bodyObj === 'string') {
    try {
      bodyObj = JSON.parse(bodyObj);
    } catch {
      // Not JSON, use as-is
    }
  }

  if (bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)) {
    // Test removing optional fields (one per variant)
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;

      const modified = { ...bodyObj };
      delete modified[key];

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Remove optional field '${key}'`,
        diffSummary: `Deleted body.${key}`,
        requestSnapshot: {
          ...base,
          body: modified,
        },
        mutationType: 'field_removal',
      });
    }

    // Test null values
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;

      const modified = { ...bodyObj, [key]: null };

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Set '${key}' to null`,
        diffSummary: `Changed body.${key} from ${JSON.stringify(bodyObj[key])} to null`,
        requestSnapshot: {
          ...base,
          body: modified,
        },
        mutationType: 'null_value',
      });
    }

    // Test empty values (strings, arrays, objects)
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;

      const value = bodyObj[key];
      let emptyValue: any;

      if (typeof value === 'string') emptyValue = '';
      else if (Array.isArray(value)) emptyValue = [];
      else if (typeof value === 'object') emptyValue = {};
      else continue;

      const modified = { ...bodyObj, [key]: emptyValue };

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Set '${key}' to empty ${typeof emptyValue}`,
        diffSummary: `Changed body.${key} to empty`,
        requestSnapshot: {
          ...base,
          body: modified,
        },
        mutationType: 'empty_value',
      });
    }

    // Test boundary values for numbers
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;
      if (typeof bodyObj[key] !== 'number') continue;

      // Test zero
      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Set '${key}' to 0`,
        diffSummary: `Changed body.${key} from ${bodyObj[key]} to 0`,
        requestSnapshot: {
          ...base,
          body: { ...bodyObj, [key]: 0 },
        },
        mutationType: 'boundary_value',
      });

      // Test negative
      if (variants.length < count) {
        variants.push({
          id: `variant-${++variantNumber}`,
          description: `Set '${key}' to -1`,
          diffSummary: `Changed body.${key} from ${bodyObj[key]} to -1`,
          requestSnapshot: {
            ...base,
            body: { ...bodyObj, [key]: -1 },
          },
          mutationType: 'boundary_value',
        });
      }

      // Test max safe integer
      if (variants.length < count) {
        variants.push({
          id: `variant-${++variantNumber}`,
          description: `Set '${key}' to Number.MAX_SAFE_INTEGER`,
          diffSummary: `Changed body.${key} to max integer`,
          requestSnapshot: {
            ...base,
            body: { ...bodyObj, [key]: Number.MAX_SAFE_INTEGER },
          },
          mutationType: 'boundary_value',
        });
      }
    }
  }

  // Test removing query parameters
  if (base.queryParams && Object.keys(base.queryParams).length > 0) {
    for (const key of Object.keys(base.queryParams)) {
      if (variants.length >= count) break;

      const modified = { ...base.queryParams };
      delete modified[key];

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Remove query parameter '${key}'`,
        diffSummary: `Deleted query.${key}`,
        requestSnapshot: {
          ...base,
          queryParams: modified,
        },
        mutationType: 'param_removal',
      });
    }
  }

  return variants.slice(0, count);
}

/**
 * Generate fuzzy test variants (typos, case changes)
 */
function generateFuzzyVariants(
  base: HttpRequestSnapshot,
  options?: ReplayOptions
): ReplayVariant[] {
  const variants: ReplayVariant[] = [];
  const count = options?.variantCount || 8;
  let variantNumber = 0;

  let bodyObj: any = base.body;
  if (typeof bodyObj === 'string') {
    try {
      bodyObj = JSON.parse(bodyObj);
    } catch {
      // Not JSON
    }
  }

  if (bodyObj && typeof bodyObj === 'object') {
    // Test field name typos
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;

      // Add typo (swap last two chars if possible)
      const typoKey = key.length > 1
        ? key.slice(0, -2) + key.charAt(key.length - 1) + key.charAt(key.length - 2)
        : key + 'x';

      const modified = { ...bodyObj };
      modified[typoKey] = modified[key];
      delete modified[key];

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Typo in field name: '${key}' → '${typoKey}'`,
        diffSummary: `Renamed body.${key} to body.${typoKey}`,
        requestSnapshot: {
          ...base,
          body: modified,
        },
        mutationType: 'typo',
      });
    }

    // Test case changes for string values
    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;
      if (typeof bodyObj[key] !== 'string') continue;

      const value = bodyObj[key];

      // Test uppercase
      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Change '${key}' to uppercase`,
        diffSummary: `Changed body.${key} from "${value}" to "${value.toUpperCase()}"`,
        requestSnapshot: {
          ...base,
          body: { ...bodyObj, [key]: value.toUpperCase() },
        },
        mutationType: 'case_change',
      });

      // Test lowercase
      if (variants.length < count) {
        variants.push({
          id: `variant-${++variantNumber}`,
          description: `Change '${key}' to lowercase`,
          diffSummary: `Changed body.${key} from "${value}" to "${value.toLowerCase()}"`,
          requestSnapshot: {
            ...base,
            body: { ...bodyObj, [key]: value.toLowerCase() },
          },
          mutationType: 'case_change',
        });
      }
    }
  }

  // Test header name case changes
  if (base.headers) {
    const headerKeys = Object.keys(base.headers);
    for (const key of headerKeys.slice(0, 2)) {
      if (variants.length >= count) break;
      if (options?.preserveAuth && key.toLowerCase().includes('auth')) continue;

      const value = base.headers[key];
      const modified = { ...base.headers };
      delete modified[key];
      modified[key.toLowerCase()] = value;

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Change header '${key}' to lowercase`,
        diffSummary: `Renamed header ${key} to ${key.toLowerCase()}`,
        requestSnapshot: {
          ...base,
          headers: modified,
        },
        mutationType: 'header_case_change',
      });
    }
  }

  return variants.slice(0, count);
}

/**
 * Generate security test variants (auth manipulation, injection tests)
 */
function generateSecurityVariants(
  base: HttpRequestSnapshot,
  options?: ReplayOptions
): ReplayVariant[] {
  const variants: ReplayVariant[] = [];
  const count = options?.variantCount || 10;
  let variantNumber = 0;

  // Skip if auth should be preserved
  if (options?.preserveAuth) {
    return variants;
  }

  // Test removing auth headers
  if (base.headers) {
    const authHeaders = ['authorization', 'x-api-key', 'x-auth-token', 'cookie'];
    
    for (const authHeader of authHeaders) {
      const key = Object.keys(base.headers).find(
        k => k.toLowerCase() === authHeader
      );

      if (key && variants.length < count) {
        const modified = { ...base.headers };
        delete modified[key];

        variants.push({
          id: `variant-${++variantNumber}`,
          description: `Remove '${key}' header (test unauthorized)`,
          diffSummary: `Deleted header ${key}`,
          requestSnapshot: {
            ...base,
            headers: modified,
          },
          mutationType: 'auth_removal',
        });
      }
    }
  }

  // Test SQL injection patterns (basic)
  let bodyObj: any = base.body;
  if (typeof bodyObj === 'string') {
    try {
      bodyObj = JSON.parse(bodyObj);
    } catch {
      // Not JSON
    }
  }

  if (bodyObj && typeof bodyObj === 'object') {
    const injectionPatterns = [
      "' OR '1'='1",
      "1; DROP TABLE users--",
      "<script>alert('XSS')</script>",
      "../../etc/passwd",
    ];

    for (const key of Object.keys(bodyObj)) {
      if (variants.length >= count) break;
      if (typeof bodyObj[key] !== 'string') continue;

      const pattern = injectionPatterns[variants.length % injectionPatterns.length];

      variants.push({
        id: `variant-${++variantNumber}`,
        description: `Test injection in '${key}'`,
        diffSummary: `Changed body.${key} to injection pattern`,
        requestSnapshot: {
          ...base,
          body: { ...bodyObj, [key]: pattern },
        },
        mutationType: 'injection_test',
      });
    }
  }

  return variants.slice(0, count);
}

/**
 * Generate load test variants (high volume, same request)
 */
function generateLoadVariants(
  base: HttpRequestSnapshot,
  options?: ReplayOptions
): ReplayVariant[] {
  const variants: ReplayVariant[] = [];
  const count = options?.variantCount || 20;

  // Simply create multiple copies of the same request
  for (let i = 0; i < count; i++) {
    variants.push({
      id: `variant-${i + 1}`,
      description: `Load test variant ${i + 1}/${count}`,
      diffSummary: 'No changes (load test)',
      requestSnapshot: { ...base },
      mutationType: 'load_test',
    });
  }

  return variants;
}

/**
 * Generate divergence variants using AI (creative variations)
 */
async function generateDivergenceVariants(
  base: HttpRequestSnapshot,
  options?: ReplayOptions,
  llmClient?: LLMClient
): Promise<ReplayVariant[]> {
  if (!llmClient) {
    // Fallback to boundary variants if no LLM
    return generateBoundaryVariants(base, options);
  }

  const count = options?.variantCount || 5;

  try {
    const prompt = buildDivergencePrompt(base, count);

    const response = await llmClient.chatJSON<{
      variants: Array<{
        description: string;
        changes: string;
        modifiedBody?: any;
        modifiedHeaders?: Record<string, string>;
        modifiedQueryParams?: Record<string, string>;
      }>;
    }>({
      messages: [
        {
          role: 'system',
          content: `You are an expert API tester. Generate creative test variations for HTTP requests.
Output must be valid JSON with this schema:
{
  "variants": [{
    "description": "What this variant tests",
    "changes": "Brief summary of changes",
    "modifiedBody": {...},
    "modifiedHeaders": {...},
    "modifiedQueryParams": {...}
  }]
}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'gpt-3.5-turbo',
      temperature: 0.8, // Higher for creativity
      maxTokens: 2000,
    });

    const variants: ReplayVariant[] = [];
    let variantNumber = 0;

    for (const variant of response.variants || []) {
      variants.push({
        id: `variant-${++variantNumber}`,
        description: variant.description,
        diffSummary: variant.changes,
        requestSnapshot: {
          ...base,
          body: variant.modifiedBody !== undefined ? variant.modifiedBody : base.body,
          headers: variant.modifiedHeaders || base.headers,
          queryParams: variant.modifiedQueryParams || base.queryParams || {},
        },
        mutationType: 'divergence',
      });
    }

    return variants.slice(0, count);
  } catch (error) {
    console.error('LLM divergence generation failed:', error);
    // Fallback to boundary variants
    return generateBoundaryVariants(base, { ...options, variantCount: count });
  }
}

/**
 * Build prompt for LLM divergence generation
 */
function buildDivergencePrompt(base: HttpRequestSnapshot, count: number): string {
  const parts: string[] = [];

  parts.push(`Generate ${count} creative test variations for this HTTP request:\n`);
  parts.push(`Method: ${base.method}`);
  parts.push(`URL: ${base.url}\n`);

  if (base.body) {
    parts.push('Body:');
    parts.push(JSON.stringify(base.body, null, 2).slice(0, 500));
  }

  parts.push('\nGenerate variations that test:');
  parts.push('- Unexpected data types');
  parts.push('- Missing required fields');
  parts.push('- Extra unexpected fields');
  parts.push('- Boundary conditions');
  parts.push('- Edge cases\n');

  parts.push('Make the variations realistic and useful for finding bugs.');

  return parts.join('\n');
}
