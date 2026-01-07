/**
 * HTTP Request Analyzer
 * Deterministic + AI-powered analysis of HTTP requests
 */

import type { LLMClient } from '../ai/llmClient';
import type {
  HttpRequestSnapshot,
  RequestAnalysisResult,
  RequestAnalysisOptions,
  RequestIssue,
  RequestSuggestion,
} from './types';
import { applyRedaction } from './utils/redaction';

/**
 * Analyze an HTTP request with deterministic checks and optional LLM enhancement
 */
export async function analyzeHttpRequest(
  snapshot: HttpRequestSnapshot,
  llmClient?: LLMClient,
  options?: RequestAnalysisOptions
): Promise<RequestAnalysisResult> {
  // Apply redaction before any AI processing
  const { snapshot: redactedSnapshot } = applyRedaction(snapshot);

  // Run deterministic checks first (fast, free, always available)
  const deterministicResult = runDeterministicChecks(redactedSnapshot);

  // Skip LLM if requested or unavailable
  if (options?.skipLLM || !llmClient) {
    return {
      ...deterministicResult,
      deterministicOnly: true,
    };
  }

  try {
    // Enhance with LLM analysis
    const llmResult = await runLLMAnalysis(redactedSnapshot, llmClient, deterministicResult);
    
    return {
      ...llmResult,
      deterministicOnly: false,
    };
  } catch (error) {
    // Graceful degradation: return deterministic results on LLM failure
    console.error('LLM analysis failed, falling back to deterministic results:', error);
    return {
      ...deterministicResult,
      deterministicOnly: true,
    };
  }
}

/**
 * Run deterministic checks (no AI required)
 */
function runDeterministicChecks(snapshot: HttpRequestSnapshot): RequestAnalysisResult {
  const issues: RequestIssue[] = [];
  const suggestions: RequestSuggestion[] = [];

  // Check for missing User-Agent
  if (!snapshot.headers['user-agent'] && !snapshot.headers['User-Agent']) {
    issues.push({
      type: 'missing_header',
      field: 'User-Agent',
      severity: 'low',
      description: 'Missing User-Agent header; some APIs may reject or deprioritize these requests',
    });
    suggestions.push({
      issueType: 'missing_header',
      suggestion: 'Add User-Agent header with your application name and version',
      codeSnippet: "headers['User-Agent'] = 'MyApp/1.0'",
    });
  }

  // Check for Content-Type mismatch
  if (snapshot.body && snapshot.method !== 'GET' && snapshot.method !== 'HEAD') {
    const contentType = snapshot.headers['content-type'] || snapshot.headers['Content-Type'];
    if (!contentType) {
      issues.push({
        type: 'missing_content_type',
        field: 'Content-Type',
        severity: 'medium',
        description: 'Request has a body but no Content-Type header',
      });
      suggestions.push({
        issueType: 'missing_content_type',
        suggestion: 'Add Content-Type header to indicate the format of your request body',
        codeSnippet: "headers['Content-Type'] = 'application/json'",
      });
    }
  }

  // Check response status
  let statusDescription = 'Unknown';
  let classification = 'unknown';
  
  if (snapshot.response) {
    const status = snapshot.response.statusCode;
    
    if (status >= 200 && status < 300) {
      statusDescription = 'Successful request';
      classification = 'success';
    } else if (status >= 400 && status < 500) {
      statusDescription = 'Client error';
      classification = 'client_error';
      
      issues.push({
        type: 'client_error',
        severity: 'high',
        description: `Request failed with ${status} status code`,
        evidence: `Status: ${status} ${getStatusText(status)}`,
      });
    } else if (status >= 500) {
      statusDescription = 'Server error';
      classification = 'server_error';
      
      issues.push({
        type: 'server_error',
        severity: 'critical',
        description: `Server error with ${status} status code`,
        evidence: `Status: ${status} ${getStatusText(status)}`,
      });
    }
  }

  // Basic classification from method and path
  const basicClassification = classifyBasicRequest(snapshot);
  if (basicClassification) {
    classification = basicClassification;
  }

  const summary = `${snapshot.method} request to ${getPathSummary(snapshot.url)}. ${statusDescription}.`;

  return {
    summary,
    classification,
    issues,
    suggestions,
    tokensUsed: 0,
    costUsd: 0,
  };
}

/**
 * Enhance analysis with LLM
 */
async function runLLMAnalysis(
  snapshot: HttpRequestSnapshot,
  llmClient: LLMClient,
  deterministicResult: RequestAnalysisResult
): Promise<RequestAnalysisResult> {
  const prompt = buildAnalysisPrompt(snapshot, deterministicResult);

  const response = await llmClient.chatJSON<{
    summary: string;
    classification: string;
    issues: RequestIssue[];
    suggestions: RequestSuggestion[];
  }>({
    messages: [
      {
        role: 'system',
        content: `You are an expert HTTP request analyzer. Analyze requests and provide structured insights.
Output must be valid JSON with this schema:
{
  "summary": "1-2 sentence description",
  "classification": "category (e.g., oauth_callback, crud:update, webhook:stripe:payment.succeeded)",
  "issues": [{"type": "string", "field": "string", "severity": "low|medium|high|critical", "description": "string"}],
  "suggestions": [{"issueType": "string", "suggestion": "string", "codeSnippet": "string (optional)"}]
}`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: 'gpt-3.5-turbo', // Use cheaper model for analysis
    temperature: 0.3, // Low temperature for consistent results
    maxTokens: 1000,
  });

  // Merge deterministic and LLM results
  const allIssues = [...deterministicResult.issues];
  const allSuggestions = [...deterministicResult.suggestions];

  // Add LLM issues that aren't duplicates
  for (const issue of response.issues || []) {
    const isDuplicate = allIssues.some(
      existing => existing.type === issue.type && existing.field === issue.field
    );
    if (!isDuplicate) {
      allIssues.push(issue);
    }
  }

  // Add LLM suggestions that aren't duplicates
  for (const suggestion of response.suggestions || []) {
    const isDuplicate = allSuggestions.some(
      existing => existing.issueType === suggestion.issueType
    );
    if (!isDuplicate) {
      allSuggestions.push(suggestion);
    }
  }

  return {
    summary: response.summary || deterministicResult.summary,
    classification: response.classification || deterministicResult.classification,
    issues: allIssues,
    suggestions: allSuggestions,
    rawAiMetadata: response,
    modelUsed: 'gpt-3.5-turbo',
    tokensUsed: 0, // Would be populated from LLM response
    costUsd: 0,     // Would be calculated based on tokens
  };
}

/**
 * Build LLM prompt for analysis
 */
function buildAnalysisPrompt(
  snapshot: HttpRequestSnapshot,
  deterministicResult: RequestAnalysisResult
): string {
  const parts: string[] = [];

  parts.push(`Analyze this HTTP request:\n`);
  parts.push(`Method: ${snapshot.method}`);
  parts.push(`URL: ${snapshot.url}`);
  
  parts.push(`\nHeaders:`);
  for (const [key, value] of Object.entries(snapshot.headers)) {
    parts.push(`  ${key}: ${value}`);
  }

  if (snapshot.body) {
    parts.push(`\nBody:`);
    const bodyStr = typeof snapshot.body === 'string' 
      ? snapshot.body 
      : JSON.stringify(snapshot.body, null, 2);
    parts.push(bodyStr.slice(0, 1000)); // Limit body size
    if (bodyStr.length > 1000) {
      parts.push('... (truncated)');
    }
  }

  if (snapshot.response) {
    parts.push(`\nResponse:`);
    parts.push(`Status: ${snapshot.response.statusCode}`);
    if (snapshot.response.body) {
      const bodyStr = typeof snapshot.response.body === 'string'
        ? snapshot.response.body
        : JSON.stringify(snapshot.response.body, null, 2);
      parts.push(bodyStr.slice(0, 500));
      if (bodyStr.length > 500) {
        parts.push('... (truncated)');
      }
    }
  }

  parts.push(`\nDeterministic analysis found ${deterministicResult.issues.length} issues.`);
  parts.push(`\nProvide additional insights, focusing on:`);
  parts.push(`- Request purpose and intent`);
  parts.push(`- Additional issues not caught by basic checks`);
  parts.push(`- Actionable suggestions for improvement`);

  return parts.join('\n');
}

/**
 * Basic request classification from method and path
 */
function classifyBasicRequest(snapshot: HttpRequestSnapshot): string | null {
  const method = snapshot.method.toUpperCase();
  const path = snapshot.url.split('?')[0].toLowerCase();

  // OAuth patterns
  if (path.includes('oauth') || path.includes('/auth/') || path.includes('/callback')) {
    if (snapshot.queryParams?.code || snapshot.body && typeof snapshot.body === 'object' && 'code' in snapshot.body) {
      return 'oauth_callback';
    }
    return 'oauth_flow';
  }

  // Webhook patterns
  if (path.includes('webhook') || path.includes('/hooks/')) {
    return 'webhook:unknown';
  }

  // CRUD operations
  if (method === 'POST' && !path.includes('/search')) {
    return 'crud:create';
  }
  if (method === 'GET') {
    return 'crud:read';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'crud:update';
  }
  if (method === 'DELETE') {
    return 'crud:delete';
  }

  return null;
}

/**
 * Get a human-readable path summary
 */
function getPathSummary(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Get HTTP status text
 */
function getStatusText(status: number): string {
  const texts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return texts[status] || '';
}
