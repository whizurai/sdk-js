/**
 * Shared HTTP layer: builds the axios instance and normalizes every error
 * response into a typed {@link WhizuraiError}.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { WhizuraiConfig } from './types';
import { errorForStatus } from './errors';

export const DEFAULT_BASE_URL = 'https://api.whizurai.com';
export const SDK_VERSION = '2.0.0';

export function createHttpClient(config: Required<WhizuraiConfig>): AxiosInstance {
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
      const data = error.response?.data as
        | { error?: { message?: string; code?: string } | string; message?: string; code?: string }
        | undefined;

      const serverMessage =
        (typeof data?.error === 'object' ? data?.error?.message : undefined) ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : undefined);

      const code =
        (typeof data?.error === 'object' ? data?.error?.code : undefined) ||
        data?.code ||
        (status ? `HTTP_${status}` : 'NETWORK_ERROR');

      let message = serverMessage || error.message;
      // Guarantee 404s read as "not found" so callers can match reliably.
      if (status === 404 && !/not found/i.test(message)) {
        message = serverMessage ? `${serverMessage} (not found)` : 'Resource not found';
      }

      return Promise.reject(errorForStatus(status, message, code, data));
    }
  );

  return http;
}
