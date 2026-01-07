/**
 * HTTP Error Diagnosis
 * Deterministic + AI-powered root cause analysis for failed requests
 */

import type { LLMClient } from '../ai/llmClient';
import type { EmbeddingsClient } from '../ai/embeddingsClient';
import type {
  HttpRequestSnapshot,
  ErrorDiagnosisResult,
  ProbableCause,
  SimilarError,
  SimilarityOptions,
} from './types';
import { applyRedaction } from './utils/redaction';

/**
 * Diagnose an HTTP error with AI-powered root cause analysis
 */
export async function diagnoseHttpError(
  snapshot: HttpRequestSnapshot,
  options?: {
    embeddingsClient?: EmbeddingsClient;
    llmClient?: LLMClient;
    similarityOptions?: SimilarityOptions;
    tenantId?: string;
  }
): Promise<ErrorDiagnosisResult> {
  // Apply redaction
  const { snapshot: redactedSnapshot } = applyRedaction(snapshot);

  // Extract status code
  const statusCode = redactedSnapshot.response?.statusCode || 0;

  if (statusCode < 400) {
    throw new Error('Request is not an error (status < 400)');
  }

  // Run deterministic checks first
  const deterministicResult = runDeterministicDiagnosis(redactedSnapshot);

  // Try to find similar errors via embeddings
  let similarErrors: SimilarError[] | undefined;
  if (options?.embeddingsClient && options?.tenantId) {
    similarErrors = await findSimilarErrors(
      redactedSnapshot,
      options.embeddingsClient,
      options.tenantId,
      options.similarityOptions
    );
  }

  // Enhance with LLM if available
  if (options?.llmClient) {
    try {
      return await enhanceWithLLM(
        redactedSnapshot,
        deterministicResult,
        similarErrors,
        options.llmClient
      );
    } catch (error) {
      console.error('LLM diagnosis failed:', error);
      // Return deterministic result on LLM failure
    }
  }

  // Return deterministic result
  return {
    ...deterministicResult,
    similarErrors: similarErrors ?? [],
    deterministicOnly: true,
  };
}

/**
 * Run deterministic error diagnosis (no AI required)
 */
function runDeterministicDiagnosis(snapshot: HttpRequestSnapshot): ErrorDiagnosisResult {
  const statusCode = snapshot.response?.statusCode || 0;
  const probableCauses: ProbableCause[] = [];
  const recommendedSteps: string[] = [];

  // Analyze by status code
  if (statusCode === 400) {
    probableCauses.push({
      cause: 'Invalid request format or missing required fields',
      confidence: 0.8,
      evidence: 'HTTP 400 Bad Request typically indicates client-side validation errors',
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push('Check API documentation for required fields and formats');
    recommendedSteps.push('Validate request body against expected schema');
    recommendedSteps.push('Review error message in response body for specific field errors');

  } else if (statusCode === 401) {
    probableCauses.push({
      cause: 'Missing or invalid authentication credentials',
      confidence: 0.9,
      evidence: 'HTTP 401 Unauthorized indicates authentication failure',
      severity: 'critical',
      class: 'auth',
    });
    recommendedSteps.push('Verify Authorization header is present and correct');
    recommendedSteps.push('Check if API key or token has expired');
    recommendedSteps.push('Ensure credentials have proper format (Bearer token, API key, etc.)');

  } else if (statusCode === 403) {
    probableCauses.push({
      cause: 'Authenticated but lacks permission for this resource',
      confidence: 0.85,
      evidence: 'HTTP 403 Forbidden indicates authorization failure',
      severity: 'critical',
      class: 'auth',
    });
    recommendedSteps.push('Verify user/API key has correct permissions or scopes');
    recommendedSteps.push('Check if resource belongs to authenticated user/organization');
    recommendedSteps.push('Review RBAC or access control policies');

  } else if (statusCode === 404) {
    probableCauses.push({
      cause: 'Resource not found or incorrect URL',
      confidence: 0.9,
      evidence: 'HTTP 404 Not Found indicates resource does not exist',
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push('Verify the URL path is correct');
    recommendedSteps.push('Check if resource ID exists in database');
    recommendedSteps.push('Confirm API endpoint spelling and version');

  } else if (statusCode === 405) {
    probableCauses.push({
      cause: 'HTTP method not allowed for this endpoint',
      confidence: 0.95,
      evidence: `HTTP 405 Method Not Allowed for ${snapshot.method} request`,
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push(`Check if ${snapshot.method} is supported by this endpoint`);
    recommendedSteps.push('Review API documentation for allowed methods');
    recommendedSteps.push('Try GET, POST, PUT, or DELETE as appropriate');

  } else if (statusCode === 409) {
    probableCauses.push({
      cause: 'Resource conflict (duplicate or version mismatch)',
      confidence: 0.8,
      evidence: 'HTTP 409 Conflict indicates state conflict',
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push('Check for duplicate resources (unique constraint violation)');
    recommendedSteps.push('Verify resource state allows this operation');
    recommendedSteps.push('Review optimistic locking or version fields');

  } else if (statusCode === 422) {
    probableCauses.push({
      cause: 'Semantically invalid request data',
      confidence: 0.85,
      evidence: 'HTTP 422 Unprocessable Entity indicates validation failure',
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push('Review detailed validation errors in response body');
    recommendedSteps.push('Check data types, formats, and business logic constraints');
    recommendedSteps.push('Validate against API schema or OpenAPI spec');

  } else if (statusCode === 429) {
    probableCauses.push({
      cause: 'Rate limit exceeded',
      confidence: 0.95,
      evidence: 'HTTP 429 Too Many Requests indicates rate limiting',
      severity: 'info',
      class: 'rate-limit',
    });
    recommendedSteps.push('Implement exponential backoff retry logic');
    recommendedSteps.push('Check Retry-After header for wait time');
    recommendedSteps.push('Review rate limit policies and upgrade if needed');

  } else if (statusCode === 500) {
    probableCauses.push({
      cause: 'Internal server error',
      confidence: 0.7,
      evidence: 'HTTP 500 Internal Server Error indicates server-side issue',
      severity: 'critical',
      class: 'server-fault',
    });
    recommendedSteps.push('Check server logs for stack traces or error details');
    recommendedSteps.push('Retry the request after a short delay');
    recommendedSteps.push('Contact API provider if error persists');

  } else if (statusCode === 502) {
    probableCauses.push({
      cause: 'Bad gateway (upstream server error)',
      confidence: 0.8,
      evidence: 'HTTP 502 Bad Gateway indicates proxy/gateway issue',
      severity: 'critical',
      class: 'server-fault',
    });
    recommendedSteps.push('Verify upstream service is running and healthy');
    recommendedSteps.push('Check load balancer or proxy configuration');
    recommendedSteps.push('Retry after brief delay as this is often transient');

  } else if (statusCode === 503) {
    probableCauses.push({
      cause: 'Service temporarily unavailable',
      confidence: 0.9,
      evidence: 'HTTP 503 Service Unavailable indicates maintenance or overload',
      severity: 'critical',
      class: 'server-fault',
    });
    recommendedSteps.push('Wait and retry (check Retry-After header)');
    recommendedSteps.push('Verify service is not under maintenance');
    recommendedSteps.push('Check system load and scaling policies');

  } else if (statusCode === 504) {
    probableCauses.push({
      cause: 'Gateway timeout waiting for upstream',
      confidence: 0.85,
      evidence: 'HTTP 504 Gateway Timeout indicates slow upstream response',
      severity: 'critical',
      class: 'server-fault',
    });
    recommendedSteps.push('Optimize slow database queries or external API calls');
    recommendedSteps.push('Increase gateway timeout settings');
    recommendedSteps.push('Implement request timeout and retry logic');

  } else {
    // Generic 4xx or 5xx
    const isClientError = statusCode >= 400 && statusCode < 500;
    probableCauses.push({
      cause: isClientError ? 'Client error (check request format)' : 'Server error',
      confidence: 0.5,
      evidence: `HTTP ${statusCode} error`,
      severity: isClientError ? 'warning' : 'critical',
      class: isClientError ? 'validation' : 'server-fault',
    });
    recommendedSteps.push('Review HTTP status code documentation');
    recommendedSteps.push('Check response body for error details');
  }

  // Check for missing Content-Type
  if (snapshot.body && !snapshot.headers['content-type'] && !snapshot.headers['Content-Type']) {
    probableCauses.push({
      cause: 'Missing Content-Type header',
      confidence: 0.6,
      evidence: 'Request has body but no Content-Type header',
      severity: 'warning',
      class: 'validation',
    });
    recommendedSteps.push('Add Content-Type header (e.g., application/json)');
  }

  // Check response body for common error patterns
  if (snapshot.response?.body) {
    const bodyStr = JSON.stringify(snapshot.response.body).toLowerCase();
    
    if (bodyStr.includes('timeout')) {
      probableCauses.push({
        cause: 'Request or operation timeout',
        confidence: 0.7,
        evidence: 'Response mentions "timeout"',
        severity: 'warning',
        class: 'server-fault',
      });
    }

    if (bodyStr.includes('database')) {
      probableCauses.push({
        cause: 'Database error or connection issue',
        confidence: 0.6,
        evidence: 'Response mentions "database"',
        severity: 'critical',
        class: 'server-fault',
      });
    }

    if (bodyStr.includes('validation')) {
      probableCauses.push({
        cause: 'Data validation failure',
        confidence: 0.75,
        evidence: 'Response mentions "validation"',
        severity: 'warning',
        class: 'validation',
      });
    }
  }

  return {
    statusCode,
    probableCauses,
    recommendedSteps,
    similarErrors: [],
  };
}

/**
 * Find similar past errors using embeddings
 */
async function findSimilarErrors(
  snapshot: HttpRequestSnapshot,
  embeddingsClient: EmbeddingsClient,
  tenantId: string,
  options?: SimilarityOptions
): Promise<SimilarError[]> {
  try {
    // Build search text from request
    const searchText = buildErrorSearchText(snapshot);

    // Search for similar errors (tenant-scoped)
    const results = await embeddingsClient.search({
      collection: 'request_errors',
      query: searchText,
      limit: options?.maxNeighbors || 20,
      minScore: options?.minScore || 0.80,
      tenantId,
      filter: {
        tenant_id: tenantId, // Enforce tenant isolation
        status_code: snapshot.response?.statusCode,
      },
    });

    // Convert to SimilarError format
    const similarErrors: SimilarError[] = results.results.map(result => {
    const payloadTimestamp = result.payload.timestamp as string | undefined;
    const entry: SimilarError = {
      requestId: result.payload.request_id as string,
      similarityScore: result.score,
      summary: result.payload.summary as string,
    };
    if (payloadTimestamp) {
      entry.timestamp = new Date(payloadTimestamp);
    }
    return entry;
  });

    return similarErrors;
  } catch (error) {
    console.error('Similar error search failed:', error);
    return [];
  }
}

/**
 * Build search text for error similarity matching
 */
function buildErrorSearchText(snapshot: HttpRequestSnapshot): string {
  const parts: string[] = [];

  parts.push(`${snapshot.method} ${snapshot.url}`);
  parts.push(`Status: ${snapshot.response?.statusCode}`);

  if (snapshot.response?.body) {
    const bodyStr = typeof snapshot.response.body === 'string'
      ? snapshot.response.body
      : JSON.stringify(snapshot.response.body);
    parts.push(bodyStr.slice(0, 200));
  }

  return parts.join(' | ');
}

/**
 * Enhance diagnosis with LLM analysis
 */
async function enhanceWithLLM(
  snapshot: HttpRequestSnapshot,
  deterministicResult: ErrorDiagnosisResult,
  similarErrors: SimilarError[] | undefined,
  llmClient: LLMClient
): Promise<ErrorDiagnosisResult> {
  const prompt = buildDiagnosisPrompt(snapshot, deterministicResult, similarErrors);

  const response = await llmClient.chatJSON<{
    probable_causes: ProbableCause[];
    recommended_steps: string[];
  }>({
    messages: [
      {
        role: 'system',
        content: `You are an expert at diagnosing HTTP API errors. Analyze errors and provide actionable insights.
Output must be valid JSON with this schema:
{
  "probable_causes": [{
    "cause": "Description",
    "confidence": 0.0-1.0,
    "evidence": "Supporting evidence",
    "severity": "info|warning|critical",
    "class": "validation|auth|rate-limit|server-fault|unknown"
  }],
  "recommended_steps": ["Step 1", "Step 2", ...]
}`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 1500,
  });

  // Merge deterministic and LLM results
  const allCauses = [...deterministicResult.probableCauses];
  for (const cause of response.probable_causes || []) {
    const isDuplicate = allCauses.some(
      existing => existing.cause.toLowerCase() === cause.cause.toLowerCase()
    );
    if (!isDuplicate) {
      allCauses.push(cause);
    }
  }

  // Sort by confidence (highest first)
  allCauses.sort((a, b) => b.confidence - a.confidence);

  const allSteps = [
    ...deterministicResult.recommendedSteps,
    ...(response.recommended_steps || []),
  ];

  return {
    statusCode: deterministicResult.statusCode,
    probableCauses: allCauses,
    recommendedSteps: allSteps,
    similarErrors: similarErrors ?? [],
    modelUsed: 'gpt-3.5-turbo',
    deterministicOnly: false,
  };
}

/**
 * Build LLM prompt for error diagnosis
 */
function buildDiagnosisPrompt(
  snapshot: HttpRequestSnapshot,
  deterministicResult: ErrorDiagnosisResult,
  similarErrors?: SimilarError[]
): string {
  const parts: string[] = [];

  parts.push('Diagnose this HTTP error:\n');
  parts.push(`Method: ${snapshot.method}`);
  parts.push(`URL: ${snapshot.url}`);
  parts.push(`Status: ${snapshot.response?.statusCode}\n`);

  if (snapshot.headers) {
    parts.push('Request Headers:');
    Object.entries(snapshot.headers).slice(0, 5).forEach(([k, v]) => {
      parts.push(`  ${k}: ${v}`);
    });
  }

  if (snapshot.body) {
    parts.push('\nRequest Body:');
    const bodyStr = typeof snapshot.body === 'string'
      ? snapshot.body
      : JSON.stringify(snapshot.body, null, 2);
    parts.push(bodyStr.slice(0, 500));
  }

  if (snapshot.response?.body) {
    parts.push('\nResponse Body:');
    const bodyStr = typeof snapshot.response.body === 'string'
      ? snapshot.response.body
      : JSON.stringify(snapshot.response.body, null, 2);
    parts.push(bodyStr.slice(0, 500));
  }

  if (similarErrors && similarErrors.length > 0) {
    parts.push(`\n${similarErrors.length} similar past errors found.`);
  }

  parts.push(`\nDeterministic analysis found ${deterministicResult.probableCauses.length} probable causes.`);
  parts.push('\nProvide additional insights and actionable debugging steps.');

  return parts.join('\n');
}
