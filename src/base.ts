/**
 * Base API Class
 * 
 * Provides common HTTP methods for API clients.
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export class BaseAPI {
  protected client: AxiosInstance;
  protected baseUrl: string;
  protected apiKey: string;
  protected tenantId: string;
  protected projectId: string;

  constructor(baseUrl: string, apiKey: string, tenantId: string, projectId: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.tenantId = tenantId;
    this.projectId = projectId;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        'X-Project-Id': projectId,
        'User-Agent': 'whizurai-sdk-js/1.0.0',
      },
    });
  }

  protected async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(path, config);
    return response.data;
  }

  protected async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(path, data, config);
    return response.data;
  }

  protected async patch<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(path, data, config);
    return response.data;
  }

  protected async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(path, data, config);
    return response.data;
  }

  protected async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(path, config);
    return response.data;
  }
}

