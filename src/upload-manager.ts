/**
 * Upload Manager
 * 
 * Handles file uploads with progress tracking and retry logic.
 */

import type { StreamsAPI } from './streams';

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  onRetry?: (attempt: number) => void;
  maxRetries?: number;
  chunkSize?: number; // For chunked uploads (future)
}

export class UploadManager {
  constructor(_streamsAPI: StreamsAPI) {
    // Constructor parameter kept for future use
    void _streamsAPI;
  }

  /**
   * Upload file to presigned URL with progress tracking
   */
  async upload(
    presignedUrl: string,
    file: File | Buffer | Blob,
    options?: UploadOptions
  ): Promise<void> {
    const maxRetries = options?.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await this._uploadWithProgress(presignedUrl, file, options);
        return; // Success
      } catch (error) {
        attempt++;
        
        if (attempt >= maxRetries) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Upload failed after ${maxRetries} attempts: ${errorMessage}`);
        }

        if (options?.onRetry) {
          options.onRetry(attempt);
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  private async _uploadWithProgress(
    url: string,
    file: File | Buffer | Blob,
    options?: UploadOptions
  ): Promise<void> {
    // For browser File/Blob - check for browser globals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalWindow = typeof (globalThis as any).window !== 'undefined' ? (globalThis as any).window : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasXHR = typeof (globalThis as any).XMLHttpRequest !== 'undefined';
    
    if (globalWindow && hasXHR) {
      return this._uploadBrowser(url, file as File | Blob, options);
    }
    
    // For Node.js Buffer
    return this._uploadNode(url, file as Buffer, options);
  }

  private async _uploadBrowser(
    url: string,
    file: File | Blob,
    options?: UploadOptions
  ): Promise<void> {
    // Only use XMLHttpRequest in browser environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XHR = (globalThis as any).XMLHttpRequest;
    if (!XHR) {
      throw new Error('XMLHttpRequest is not available in this environment');
    }

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xhr = new XHR() as any;

      xhr.upload.addEventListener('progress', (e: { lengthComputable: boolean; loaded: number; total: number }) => {
        if (e.lengthComputable && options?.onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          options.onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.send(file);
    });
  }

  private async _uploadNode(
    url: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'PUT',
      body: buffer,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length.toString(),
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    if (options?.onProgress) {
      options.onProgress(100);
    }
  }
}

