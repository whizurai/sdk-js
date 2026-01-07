/**
 * Webhook Classification
 * 
 * Identifies and classifies webhook events from popular providers:
 * - Stripe, Shopify, GitHub, Twilio, SendGrid, etc.
 * - Event type detection
 * - Idempotency key extraction
 * - Retry detection
 */

import type { HttpRequestSnapshot } from '../http/types';

export interface WebhookClassificationResult {
  isWebhook: boolean;
  confidence: number; // 0-1
  provider: string | null;
  eventType: string | null;
  idempotencyKey: string | null;
  isRetry: boolean;
  retryCount: number;
  signature: string | null;
  timestamp: Date | null;
  metadata: Record<string, any>;
}

const WEBHOOK_PATTERNS = {
  stripe: {
    headers: ['stripe-signature'],
    paths: ['/webhook', '/stripe'],
    eventField: 'type',
  },
  shopify: {
    headers: ['x-shopify-hmac-sha256', 'x-shopify-topic'],
    paths: ['/webhooks/shopify'],
    eventField: 'topic',
  },
  github: {
    headers: ['x-github-event', 'x-hub-signature-256'],
    paths: ['/webhooks/github', '/github/webhook'],
    eventField: 'action',
  },
  twilio: {
    headers: ['x-twilio-signature'],
    paths: ['/webhooks/twilio', '/twilio'],
    eventField: 'EventType',
  },
  sendgrid: {
    headers: ['x-twilio-email-event-webhook-signature'],
    paths: ['/webhooks/sendgrid'],
    eventField: 'event',
  },
  slack: {
    headers: ['x-slack-signature'],
    paths: ['/slack/events', '/webhooks/slack'],
    eventField: 'type',
  },
  square: {
    headers: ['x-square-signature'],
    paths: ['/webhooks/square'],
    eventField: 'type',
  },
  paypal: {
    headers: ['paypal-transmission-sig'],
    paths: ['/webhooks/paypal'],
    eventField: 'event_type',
  },
};

/**
 * Classify webhook request
 */
export async function classifyWebhook(
  request: HttpRequestSnapshot
): Promise<WebhookClassificationResult> {
  const headers = normalizeHeaders(request.headers);
  const path = new URL(request.url, 'http://placeholder').pathname.toLowerCase();

  // Check each provider
  for (const [provider, pattern] of Object.entries(WEBHOOK_PATTERNS)) {
    const match = matchesProvider(headers, path, pattern);
    if (match.isMatch) {
      const body = parseBody(typeof request.body === 'string' ? request.body : JSON.stringify(request.body || ''));
      const eventType = extractEventType(body, pattern.eventField);
      const idempotencyKey = extractIdempotencyKey(headers, body, provider);
      const { isRetry, retryCount } = detectRetry(headers, body, provider);
      const signature = extractSignature(headers, provider);
      const timestamp = extractTimestamp(headers, body);

      return {
        isWebhook: true,
        confidence: match.confidence,
        provider,
        eventType,
        idempotencyKey,
        isRetry,
        retryCount,
        signature,
        timestamp,
        metadata: { body },
      };
    }
  }

  // Generic webhook detection
  const genericMatch = detectGenericWebhook(headers, path, typeof request.body === 'string' ? request.body : JSON.stringify(request.body || ''));
  if (genericMatch.isWebhook) {
    return genericMatch;
  }

  return {
    isWebhook: false,
    confidence: 0,
    provider: null,
    eventType: null,
    idempotencyKey: null,
    isRetry: false,
    retryCount: 0,
    signature: null,
    timestamp: null,
    metadata: {},
  };
}

/**
 * Match provider pattern
 */
function matchesProvider(
  headers: Record<string, string>,
  path: string,
  pattern: {
    headers: string[];
    paths: string[];
    eventField: string;
  }
): { isMatch: boolean; confidence: number } {
  let score = 0;
  const maxScore = 2;

  // Check headers
  for (const header of pattern.headers) {
    if (headers[header]) {
      score += 1;
      break;
    }
  }

  // Check path
  for (const pathPattern of pattern.paths) {
    if (path.includes(pathPattern)) {
      score += 1;
      break;
    }
  }

  return {
    isMatch: score > 0,
    confidence: score / maxScore,
  };
}

/**
 * Generic webhook detection
 */
function detectGenericWebhook(
  headers: Record<string, string>,
  path: string,
  body: string
): WebhookClassificationResult {
  let score = 0;

  // Path indicators
  if (path.includes('/webhook') || path.includes('/events') || path.includes('/callback')) {
    score += 0.3;
  }

  // Signature headers
  const signatureHeaders = ['x-signature', 'x-hub-signature', 'signature', 'x-webhook-signature'];
  for (const header of signatureHeaders) {
    if (headers[header]) {
      score += 0.3;
      break;
    }
  }

  // Event-like body structure
  const parsedBody = parseBody(body);
  if (parsedBody && (parsedBody.event || parsedBody.type || parsedBody.eventType)) {
    score += 0.2;
  }

  // POST method requirement (from snapshot)
  score += 0.2;

  const isWebhook = score >= 0.5;

  return {
    isWebhook,
    confidence: isWebhook ? Math.min(score, 0.9) : 0,
    provider: 'unknown',
    eventType: parsedBody?.event || parsedBody?.type || parsedBody?.eventType || null,
    idempotencyKey: null,
    isRetry: false,
    retryCount: 0,
    signature: null,
    timestamp: null,
    metadata: { body: parsedBody },
  };
}

/**
 * Extract event type
 */
function extractEventType(body: any, eventField: string): string | null {
  if (!body || typeof body !== 'object') return null;
  return body[eventField] || null;
}

/**
 * Extract idempotency key
 */
function extractIdempotencyKey(
  headers: Record<string, string>,
  body: any,
  provider: string
): string | null {
  // Check headers first
  const idempotencyHeaders = [
    'idempotency-key',
    'x-idempotency-key',
    'x-request-id',
    'x-event-id',
  ];

  for (const header of idempotencyHeaders) {
    if (headers[header]) return headers[header];
  }

  // Provider-specific body fields
  if (body && typeof body === 'object') {
    if (provider === 'stripe' && body.id) return body.id;
    if (provider === 'shopify' && body.id) return String(body.id);
    if (provider === 'github' && body.delivery) return body.delivery;
    if (body.id) return String(body.id);
    if (body.event_id) return String(body.event_id);
  }

  return null;
}

/**
 * Detect retry attempts
 */
function detectRetry(
  headers: Record<string, string>,
  body: any,
  _provider: string
): { isRetry: boolean; retryCount: number } {
  // Check retry headers
  if (headers['x-retry-count']) {
    return {
      isRetry: true,
      retryCount: parseInt(headers['x-retry-count'], 10) || 0,
    };
  }

  if (headers['stripe-signature'] && headers['x-stripe-retry-count']) {
    return {
      isRetry: true,
      retryCount: parseInt(headers['x-stripe-retry-count'], 10) || 0,
    };
  }

  // Provider-specific body fields
  if (body && typeof body === 'object') {
    if (body.retry_count !== undefined) {
      return {
        isRetry: body.retry_count > 0,
        retryCount: body.retry_count,
      };
    }
    if (body.attempt !== undefined && body.attempt > 1) {
      return {
        isRetry: true,
        retryCount: body.attempt - 1,
      };
    }
  }

  return { isRetry: false, retryCount: 0 };
}

/**
 * Extract signature
 */
function extractSignature(headers: Record<string, string>, provider: string): string | null {
  const signatureMap: Record<string, string> = {
    stripe: 'stripe-signature',
    shopify: 'x-shopify-hmac-sha256',
    github: 'x-hub-signature-256',
    twilio: 'x-twilio-signature',
    slack: 'x-slack-signature',
    square: 'x-square-signature',
    paypal: 'paypal-transmission-sig',
  };

  const header = signatureMap[provider];
  return header && headers[header] ? headers[header] : null;
}

/**
 * Extract timestamp
 */
function extractTimestamp(headers: Record<string, string>, body: any): Date | null {
  // Check headers
  if (headers['x-webhook-timestamp']) {
    return new Date(headers['x-webhook-timestamp']);
  }

  // Check body
  if (body && typeof body === 'object') {
    if (body.timestamp) return new Date(body.timestamp * 1000);
    if (body.created) return new Date(body.created * 1000);
    if (body.created_at) return new Date(body.created_at);
    if (body.event_time) return new Date(body.event_time);
  }

  return null;
}

/**
 * Normalize header names
 */
function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/**
 * Parse body safely
 */
function parseBody(body: string): any {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
