/**
 * API Schema Inference
 * 
 * Analyzes multiple HTTP requests to the same endpoint and infers:
 * - Normalized path templates
 * - Request/response schemas (JSON Schema format)
 * - Auth patterns (header-based, bearer, basic, API key)
 * - Query parameter schemas
 * - Header schemas
 * - Content-Type patterns
 * 
 * Used to automatically build an API map from real traffic.
 */

import type { HttpRequestSnapshot } from '../http/types';
import { normalizePath } from './utils/pathNormalization';
import { mergeJsonSamples, toOpenApiSchema, type JsonSchema, type SchemaMergeOptions } from './utils/jsonMerge';

/**
 * Auth pattern types
 */
export type AuthPattern =
  | 'none'
  | 'bearer'
  | 'basic'
  | 'api-key-header'
  | 'api-key-query'
  | 'custom-header'
  | 'cookie';

/**
 * Auth pattern detection result
 */
export interface DetectedAuthPattern {
  type: AuthPattern;
  headerName?: string;
  queryParamName?: string;
  description: string;
  confidence: number; // 0-1
}

/**
 * Inferred endpoint schema
 */
export interface InferredEndpoint {
  /** Normalized path template (e.g., /users/{id}) */
  path: string;
  
  /** HTTP method */
  method: string;
  
  /** Request body schema (if applicable) */
  requestSchema?: JsonSchema;
  
  /** Response schemas by status code */
  responseSchemas: Record<number, JsonSchema>;
  
  /** Query parameter schema */
  queryParamSchema?: JsonSchema;
  
  /** Request header schema */
  requestHeaderSchema?: JsonSchema;
  
  /** Detected auth patterns */
  authPatterns: DetectedAuthPattern[];
  
  /** Common content types */
  requestContentTypes: string[];
  responseContentTypes: string[];
  
  /** Number of requests analyzed */
  sampleCount: number;
  
  /** Status code distribution */
  statusCodeDistribution: Record<number, number>;
  
  /** AI-generated description (if LLM is provided) */
  description?: string;
}

/**
 * Schema inference options
 */
export interface SchemaInferenceOptions extends SchemaMergeOptions {
  /** Whether to detect auth patterns (default: true) */
  detectAuth?: boolean;
  
  /** Whether to infer header schemas (default: false, as headers vary a lot) */
  inferHeaders?: boolean;
  
  /** LLM client for generating descriptions (optional) */
  llmClient?: {
    complete: (prompt: string) => Promise<string>;
  };
}

/**
 * API map: collection of inferred endpoints
 */
export interface ApiMap {
  endpoints: InferredEndpoint[];
  totalRequests: number;
  uniquePaths: number;
  generatedAt: Date;
}

/**
 * Detect authentication pattern from headers
 */
function detectAuthPattern(headers: Record<string, string>): DetectedAuthPattern[] {
  const patterns: DetectedAuthPattern[] = [];
  const lowerHeaders: Record<string, string> = {};

  // Normalize header names to lowercase
  for (const [key, value] of Object.entries(headers)) {
    lowerHeaders[key.toLowerCase()] = value;
  }

  // Check for Authorization header
  const authHeader = lowerHeaders['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      patterns.push({
        type: 'bearer',
        headerName: 'Authorization',
        description: 'Bearer token authentication',
        confidence: 0.95,
      });
    } else if (authHeader.startsWith('Basic ')) {
      patterns.push({
        type: 'basic',
        headerName: 'Authorization',
        description: 'HTTP Basic authentication',
        confidence: 0.95,
      });
    }
  }

  // Check for common API key headers
  const apiKeyHeaders = ['x-api-key', 'x-api-token', 'apikey', 'api-key'];
  for (const headerName of apiKeyHeaders) {
    if (lowerHeaders[headerName]) {
      patterns.push({
        type: 'api-key-header',
        headerName,
        description: `API key in ${headerName} header`,
        confidence: 0.9,
      });
    }
  }

  // Check for session cookies
  if (lowerHeaders['cookie']) {
    const cookieValue = lowerHeaders['cookie'];
    if (cookieValue.includes('session') || cookieValue.includes('token')) {
      patterns.push({
        type: 'cookie',
        description: 'Session cookie authentication',
        confidence: 0.7,
      });
    }
  }

  // If no auth detected
  if (patterns.length === 0) {
    patterns.push({
      type: 'none',
      description: 'No authentication detected',
      confidence: 0.5,
    });
  }

  return patterns;
}

/**
 * Parse query string into object
 */
function parseQueryString(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (!url.includes('?')) return params;
  
  const queryString = url.split('?')[1];
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }
  
  return params;
}

/**
 * Infer schema for a single endpoint from multiple requests
 */
export function inferEndpointSchema(
  requests: HttpRequestSnapshot[],
  options: SchemaInferenceOptions = {}
): InferredEndpoint {
  if (requests.length === 0) {
    throw new Error('Cannot infer schema from zero requests');
  }

  // All requests should have same method
  const method = requests[0].method.toUpperCase();
  
  // Normalize paths and pick the most common normalized form
  const normalizedPaths = requests.map(r => normalizePath(r.url.split('?')[0]));
  const pathCounts = new Map<string, number>();
  
  for (const np of normalizedPaths) {
    pathCounts.set(np.normalized, (pathCounts.get(np.normalized) || 0) + 1);
  }
  
  const mostCommonPath = Array.from(pathCounts.entries())
    .sort((a, b) => b[1] - a[1])[0][0];

  // Parse request bodies
  const requestBodies: any[] = [];
  for (const req of requests) {
    if (req.body) {
      try {
        const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        requestBodies.push(JSON.parse(bodyStr));
      } catch (e) {
        // Skip non-JSON bodies
      }
    }
  }

  // Parse response bodies by status code
  const responseBodiesByStatus: Record<number, any[]> = {};
  const statusCodeCounts: Record<number, number> = {};
  
  for (const req of requests) {
    const status = req.response?.statusCode || 200;
    statusCodeCounts[status] = (statusCodeCounts[status] || 0) + 1;
    
    if (req.response?.body) {
      try {
        const bodyStr = typeof req.response.body === 'string' ? req.response.body : JSON.stringify(req.response.body);
        const parsed = JSON.parse(bodyStr);
        if (!responseBodiesByStatus[status]) {
          responseBodiesByStatus[status] = [];
        }
        responseBodiesByStatus[status].push(parsed);
      } catch (e) {
        // Skip non-JSON response bodies
      }
    }
  }

  // Parse query parameters
  const queryParams: Record<string, string>[] = requests.map(r => parseQueryString(r.url));

  // Merge schemas
  const requestSchema = requestBodies.length > 0
    ? mergeJsonSamples(requestBodies, options)
    : undefined;

  const responseSchemas: Record<number, JsonSchema> = {};
  for (const [status, bodies] of Object.entries(responseBodiesByStatus)) {
    responseSchemas[Number(status)] = mergeJsonSamples(bodies, options);
  }

  const queryParamSchema = queryParams.length > 0 && queryParams.some(p => Object.keys(p).length > 0)
    ? mergeJsonSamples(queryParams, options)
    : undefined;

  // Detect auth patterns
  const authPatterns: DetectedAuthPattern[] = [];
  if (options.detectAuth !== false) {
    const detectedPatterns = new Map<string, DetectedAuthPattern>();
    
    for (const req of requests) {
      const patterns = detectAuthPattern(req.headers);
      for (const pattern of patterns) {
        const key = `${pattern.type}:${pattern.headerName || ''}`;
        detectedPatterns.set(key, pattern);
      }
    }
    
    authPatterns.push(...detectedPatterns.values());
  }

  // Collect content types
  const requestContentTypes = new Set<string>();
  const responseContentTypes = new Set<string>();
  
  for (const req of requests) {
    const reqContentType = req.headers['content-type'] || req.headers['Content-Type'];
    if (reqContentType) {
      // Remove charset suffix
      const ct = reqContentType.split(';')[0].trim();
      requestContentTypes.add(ct);
    }
    
    const resContentType = req.response?.headers?.['content-type'] || req.response?.headers?.['Content-Type'];
    if (resContentType) {
      const ct = resContentType.split(';')[0].trim();
      responseContentTypes.add(ct);
    }
  }

  const result: InferredEndpoint = {
    path: mostCommonPath,
    method,
    responseSchemas,
    authPatterns,
    requestContentTypes: Array.from(requestContentTypes),
    responseContentTypes: Array.from(responseContentTypes),
    sampleCount: requests.length,
    statusCodeDistribution: statusCodeCounts,
  };

  // Only add optional properties when they have values
  if (requestSchema !== undefined) {
    result.requestSchema = requestSchema;
  }
  if (queryParamSchema !== undefined) {
    result.queryParamSchema = queryParamSchema;
  }

  return result;
}

/**
 * Generate LLM description for an endpoint
 */
async function generateEndpointDescription(
  endpoint: InferredEndpoint,
  llmClient: { complete: (prompt: string) => Promise<string> }
): Promise<string> {
  const prompt = `You are an API documentation expert. Based on the following endpoint details, provide a concise 1-2 sentence description of what this endpoint does.

Method: ${endpoint.method}
Path: ${endpoint.path}
Request Schema: ${endpoint.requestSchema ? JSON.stringify(endpoint.requestSchema, null, 2) : 'None'}
Response Status Codes: ${Object.keys(endpoint.responseSchemas).join(', ')}
Sample Response (${Object.keys(endpoint.responseSchemas)[0]}): ${JSON.stringify(endpoint.responseSchemas[Number(Object.keys(endpoint.responseSchemas)[0])], null, 2)}

Provide only the description, no additional text:`;

  try {
    const description = await llmClient.complete(prompt);
    return description.trim();
  } catch (e) {
    return ''; // Fail gracefully
  }
}

/**
 * Infer API map from a collection of requests
 * Groups requests by normalized path + method and infers schemas
 */
export async function inferApiMap(
  requests: HttpRequestSnapshot[],
  options: SchemaInferenceOptions = {}
): Promise<ApiMap> {
  // Group requests by normalized path + method
  const groups = new Map<string, HttpRequestSnapshot[]>();
  
  for (const req of requests) {
    const pathOnly = req.url.split('?')[0];
    const normalized = normalizePath(pathOnly);
    const key = `${req.method.toUpperCase()}:${normalized.normalized}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(req);
  }

  // Infer schema for each group
  const endpoints: InferredEndpoint[] = [];
  
  for (const [_key, groupRequests] of groups.entries()) {
    const endpoint = inferEndpointSchema(groupRequests, options);
    
    // Generate LLM description if client provided
    if (options.llmClient) {
      endpoint.description = await generateEndpointDescription(endpoint, options.llmClient);
    }
    
    endpoints.push(endpoint);
  }

  // Sort endpoints by path then method
  endpoints.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  return {
    endpoints,
    totalRequests: requests.length,
    uniquePaths: groups.size,
    generatedAt: new Date(),
  };
}

/**
 * Convert inferred endpoint to OpenAPI 3.0 path item
 */
export function toOpenApiPathItem(endpoint: InferredEndpoint): any {
  const operation: any = {
    summary: endpoint.description || `${endpoint.method} ${endpoint.path}`,
    parameters: [],
    responses: {},
  };

  // Add path parameters
  const pathParams = endpoint.path.match(/\{([^}]+)\}/g);
  if (pathParams) {
    for (const param of pathParams) {
      const paramName = param.slice(1, -1); // Remove { }
      operation.parameters.push({
        name: paramName,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
  }

  // Add query parameters
  if (endpoint.queryParamSchema?.properties) {
    for (const [paramName, paramSchema] of Object.entries(endpoint.queryParamSchema.properties)) {
      operation.parameters.push({
        name: paramName,
        in: 'query',
        required: endpoint.queryParamSchema.required?.includes(paramName) || false,
        schema: toOpenApiSchema(paramSchema),
      });
    }
  }

  // Add request body
  if (endpoint.requestSchema) {
    operation.requestBody = {
      required: true,
      content: {},
    };
    
    for (const contentType of endpoint.requestContentTypes) {
      operation.requestBody.content[contentType] = {
        schema: toOpenApiSchema(endpoint.requestSchema),
      };
    }
    
    // Default to application/json if no content types found
    if (endpoint.requestContentTypes.length === 0) {
      operation.requestBody.content['application/json'] = {
        schema: toOpenApiSchema(endpoint.requestSchema),
      };
    }
  }

  // Add responses
  for (const [status, schema] of Object.entries(endpoint.responseSchemas)) {
    operation.responses[status] = {
      description: `Response with status ${status}`,
      content: {},
    };
    
    for (const contentType of endpoint.responseContentTypes) {
      operation.responses[status].content[contentType] = {
        schema: toOpenApiSchema(schema),
      };
    }
    
    // Default to application/json if no content types found
    if (endpoint.responseContentTypes.length === 0) {
      operation.responses[status].content['application/json'] = {
        schema: toOpenApiSchema(schema),
      };
    }
  }

  // Add security
  if (endpoint.authPatterns.some(p => p.type === 'bearer')) {
    operation.security = [{ bearerAuth: [] }];
  } else if (endpoint.authPatterns.some(p => p.type === 'api-key-header')) {
    operation.security = [{ apiKeyAuth: [] }];
  }

  return {
    [endpoint.method.toLowerCase()]: operation,
  };
}

/**
 * Convert full API map to OpenAPI 3.0 specification
 */
export function toOpenApiSpec(apiMap: ApiMap, info: { title: string; version: string; description?: string }): any {
  const paths: Record<string, any> = {};
  
  for (const endpoint of apiMap.endpoints) {
    const pathItem = toOpenApiPathItem(endpoint);
    
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }
    
    Object.assign(paths[endpoint.path], pathItem);
  }

  const spec: any = {
    openapi: '3.0.0',
    info,
    paths,
    components: {
      securitySchemes: {},
    },
  };

  // Add security schemes if any auth patterns found
  const hasBearer = apiMap.endpoints.some(e => e.authPatterns.some(p => p.type === 'bearer'));
  const hasApiKey = apiMap.endpoints.some(e => e.authPatterns.some(p => p.type === 'api-key-header'));

  if (hasBearer) {
    spec.components.securitySchemes.bearerAuth = {
      type: 'http',
      scheme: 'bearer',
    };
  }

  if (hasApiKey) {
    spec.components.securitySchemes.apiKeyAuth = {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    };
  }

  return spec;
}
