/**
 * Secrets Redaction Utility
 * Deterministic redaction of sensitive data before AI processing
 */

import type { HttpRequestSnapshot, RedactedSnapshot } from '../types';

const REDACTION_PATTERNS = {
  // Credit card patterns (basic Luhn-compatible detection)
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  
  // Email addresses
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // JWT tokens
  JWT: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  
  // API keys (common patterns)
  API_KEY: /\b[A-Za-z0-9]{32,}\b/g,
  
  // AWS keys
  AWS_KEY: /AKIA[0-9A-Z]{16}/g,
};

const SENSITIVE_HEADER_NAMES = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
];

const SENSITIVE_FIELD_NAMES = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'credit_card',
  'creditcard',
  'cvv',
  'ssn',
];

const MAX_BODY_SIZE = 100 * 1024; // 100KB

/**
 * Apply deterministic redaction to an HTTP request snapshot
 */
export function applyRedaction(snapshot: HttpRequestSnapshot): RedactedSnapshot {
  const redactedFields: string[] = [];
  
  // Deep clone to avoid mutation
  const redacted: HttpRequestSnapshot = JSON.parse(JSON.stringify(snapshot));

  // Redact headers
  if (redacted.headers) {
    for (const [key, value] of Object.entries(redacted.headers)) {
      if (isSensitiveHeader(key)) {
        redacted.headers[key] = `[REDACTED:${key.toUpperCase()}]`;
        redactedFields.push(`header.${key}`);
      } else if (typeof value === 'string') {
        const redactedValue = redactString(value);
        if (redactedValue !== value) {
          redacted.headers[key] = redactedValue;
          redactedFields.push(`header.${key}`);
        }
      }
    }
  }

  // Redact request body
  if (redacted.body) {
    const result = redactBody(redacted.body, 'body');
    redacted.body = result.value;
    redactedFields.push(...result.redactedPaths);
  }

  // Redact response body if present
  if (redacted.response?.body) {
    const result = redactBody(redacted.response.body, 'response.body');
    redacted.response.body = result.value;
    redactedFields.push(...result.redactedPaths);
  }

  // Truncate large bodies
  if (redacted.body && typeof redacted.body === 'string' && redacted.body.length > MAX_BODY_SIZE) {
    redacted.body = redacted.body.slice(0, MAX_BODY_SIZE) + '\n[TRUNCATED: Body too large]';
    redactedFields.push('body (truncated)');
  }

  return {
    snapshot: redacted,
    redactionApplied: redactedFields.length > 0,
    redactedFields,
  };
}

/**
 * Check if a header name is sensitive
 */
function isSensitiveHeader(headerName: string): boolean {
  const lower = headerName.toLowerCase();
  return SENSITIVE_HEADER_NAMES.some(name => lower.includes(name));
}

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some(name => lower.includes(name));
}

/**
 * Redact patterns in a string
 */
function redactString(value: string): string {
  let redacted = value;

  // Redact credit cards
  redacted = redacted.replace(REDACTION_PATTERNS.CREDIT_CARD, '[REDACTED:CREDIT_CARD]');
  
  // Redact JWTs
  redacted = redacted.replace(REDACTION_PATTERNS.JWT, '[REDACTED:JWT]');
  
  // Redact AWS keys
  redacted = redacted.replace(REDACTION_PATTERNS.AWS_KEY, '[REDACTED:AWS_KEY]');
  
  // Redact emails (only if multiple patterns matched, to avoid false positives)
  if (redacted !== value) {
    redacted = redacted.replace(REDACTION_PATTERNS.EMAIL, '[REDACTED:EMAIL]');
  }

  return redacted;
}

/**
 * Recursively redact sensitive fields in objects/arrays
 */
function redactBody(
  body: unknown,
  path: string
): { value: unknown; redactedPaths: string[] } {
  const redactedPaths: string[] = [];

  if (typeof body === 'string') {
    const redacted = redactString(body);
    if (redacted !== body) {
      redactedPaths.push(path);
    }
    return { value: redacted, redactedPaths };
  }

  if (Array.isArray(body)) {
    const redactedArray = body.map((item, index) => {
      const result = redactBody(item, `${path}[${index}]`);
      redactedPaths.push(...result.redactedPaths);
      return result.value;
    });
    return { value: redactedArray, redactedPaths };
  }

  if (body && typeof body === 'object') {
    const redactedObj: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(body)) {
      const fieldPath = `${path}.${key}`;
      
      // Redact entire field if name is sensitive
      if (isSensitiveField(key)) {
        redactedObj[key] = `[REDACTED:SECRET_FIELD:${key}]`;
        redactedPaths.push(fieldPath);
      } else {
        // Recurse into nested structures
        const result = redactBody(value, fieldPath);
        redactedObj[key] = result.value;
        redactedPaths.push(...result.redactedPaths);
      }
    }
    
    return { value: redactedObj, redactedPaths };
  }

  // Primitive values (numbers, booleans, null)
  return { value: body, redactedPaths };
}

/**
 * Hash a string for idempotency checking (for debugging)
 */
export function hashForDedup(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Validate that redaction was applied before AI processing
 */
export function validateRedaction(snapshot: HttpRequestSnapshot): boolean {
  // Check for common unredacted patterns
  const jsonStr = JSON.stringify(snapshot);
  
  // Should not contain raw JWTs
  if (REDACTION_PATTERNS.JWT.test(jsonStr)) {
    return false;
  }
  
  // Should not contain credit cards
  if (REDACTION_PATTERNS.CREDIT_CARD.test(jsonStr)) {
    return false;
  }
  
  // Should not have raw auth headers
  if (snapshot.headers) {
    for (const key of Object.keys(snapshot.headers)) {
      if (isSensitiveHeader(key)) {
        const value = snapshot.headers[key];
        if (value && !value.includes('[REDACTED')) {
          return false;
        }
      }
    }
  }
  
  return true;
}
