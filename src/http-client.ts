/**
 * Shared HTTP layer: builds the axios instance and normalizes every error
 * response into a typed {@link WhizuraiError}.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { WhizuraiConfig } from './types';
import { errorForStatus, TimeoutError } from './errors';

export const DEFAULT_BASE_URL = 'https://api.whizurai.com';
export const SDK_VERSION = '3.1.0';

/** Connection settings for one HTTP client (gateway or model-router). */
export type HttpClientConfig = Required<Pick<WhizuraiConfig, 'apiKey' | 'baseUrl' | 'timeout'>>;

export function createHttpClient(config: HttpClientConfig): AxiosInstance {
  const baseURL = config.baseUrl.replace(/\/$/, '');

  const http = axios.create({
    baseURL,
    timeout: config.timeout,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `whizurai-sdk-js/${SDK_VERSION}`,
      // The gateway accepts either header; send both so the same client works
      // for API-key auth regardless of which the deployment prefers.
      'X-API-Key': config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  http.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const status = error.response?.status;
      if (!error.response && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
        return Promise.reject(new TimeoutError(error.message || 'Request timed out'));
      }
      const { message: serverMessage, code: serverCode } = parseErrorBody(error.response?.data);
      const code = serverCode || (status ? `HTTP_${status}` : 'NETWORK_ERROR');

      let message = serverMessage || error.message;
      // Guarantee 404s read as "not found" so callers can match reliably.
      if (status === 404 && !/not found/i.test(message)) {
        message = serverMessage ? `${serverMessage} (not found)` : 'Resource not found';
      }

      return Promise.reject(errorForStatus(status, message, code, error.response?.data));
    }
  );

  return http;
}

type ErrorObject = { message?: unknown; code?: unknown; error?: unknown; msg?: unknown };

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/**
 * Pull a message and code out of any error body the platform emits:
 * `{error: {code, message}}`, `{error: "code", message}`, `{message, code}`,
 * and FastAPI's `{detail: "..."}`, `{detail: {error, message}}` or
 * `{detail: [{msg, loc}, ...]}` (request validation).
 */
export function parseErrorBody(data: unknown): { message?: string; code?: string } {
  if (typeof data === 'string') return { message: str(data) };
  if (!data || typeof data !== 'object') return {};
  const body = data as ErrorObject & { detail?: unknown };

  let message: string | undefined;
  let code: string | undefined;

  if (body.error && typeof body.error === 'object') {
    const e = body.error as ErrorObject;
    message = str(e.message);
    code = str(e.code) ?? str(e.error);
  } else if (typeof body.error === 'string') {
    code = body.error;
  }
  message = message ?? str(body.message);
  code = code ?? str(body.code);

  const detail = body.detail;
  if (typeof detail === 'string') {
    message = message ?? detail;
  } else if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        const item = d as ErrorObject & { loc?: unknown };
        const loc = Array.isArray(item.loc) ? item.loc.join('.') : undefined;
        const m = str(item.msg) ?? str(item.message);
        return m ? (loc ? `${loc}: ${m}` : m) : undefined;
      })
      .filter(Boolean);
    if (parts.length) message = message ?? parts.join('; ');
  } else if (detail && typeof detail === 'object') {
    const d = detail as ErrorObject;
    const nested = d.error && typeof d.error === 'object' ? (d.error as ErrorObject) : undefined;
    message = message ?? str(d.message) ?? str(nested?.message);
    code = code ?? str(d.code) ?? str(d.error) ?? str(nested?.code);
  }

  // A bare `{error: "some sentence"}` with no message: use it as the message.
  if (!message && typeof body.error === 'string') message = body.error;
  return { message, code };
}
