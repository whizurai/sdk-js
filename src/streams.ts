/**
 * Whizurai Streams SDK
 * 
 * TypeScript/JavaScript client for video upload, processing, and insights.
 */

import { BaseAPI } from './base';
import { UploadManager } from './upload-manager';
import type {
  Video,
  VideoInsights,
  VideoVariant,
  VideoStatus,
  PlayerConfig,
  CreateUploadUrlParams,
  CreateUploadUrlResponse,
  ListVideosParams,
  ListVideosResponse,
  PublishParams,
  PublishResponse,
} from './types/streams';

export class StreamsAPI extends BaseAPI {
  private uploadManager: UploadManager;

  constructor(baseUrl: string, apiKey: string, tenantId: string, projectId: string) {
    super(baseUrl, apiKey, tenantId, projectId);
    this.uploadManager = new UploadManager(this);
  }

  /**
   * Create presigned upload URL
   */
  async createUploadUrl(params: CreateUploadUrlParams): Promise<CreateUploadUrlResponse> {
    return this.post<CreateUploadUrlResponse>('/v1/streams/upload-url', params);
  }

  /**
   * Upload video file (convenience method)
   */
  async uploadFile(
    file: File | Buffer,
    options?: {
      filename?: string;
      title?: string;
      description?: string;
      tags?: string[];
      onProgress?: (progress: number) => void;
    }
  ): Promise<string> {
    const filename = options?.filename || (file instanceof File ? file.name : 'video.mp4');
    const fileSize = file instanceof File ? file.size : file.length;

    // 1. Create upload URL
    const metadata: { title?: string; description?: string; tags?: string[] } = {};
    if (options?.title !== undefined) metadata.title = options.title;
    if (options?.description !== undefined) metadata.description = options.description;
    if (options?.tags !== undefined) metadata.tags = options.tags;

    const { videoId, uploadUrl } = await this.createUploadUrl({
      filename,
      fileSize,
      contentType: 'video/mp4',
      metadata,
    });

    // 2. Upload file
    const uploadOptions: { onProgress?: (progress: number) => void } = {};
    if (options?.onProgress !== undefined) {
      uploadOptions.onProgress = options.onProgress;
    }
    await this.uploadManager.upload(uploadUrl, file, uploadOptions);

    return videoId;
  }

  /**
   * Upload from URL
   */
  async uploadFromUrl(
    url: string,
    options?: {
      title?: string;
      description?: string;
      tags?: string[];
    }
  ): Promise<string> {
    // Fetch file from URL
    const response = await fetch(url);
    const blob = await response.blob();
    const filename = url.split('/').pop() || 'video.mp4';

    return this.uploadFile(blob as any, {
      filename,
      ...options,
    });
  }

  /**
   * Get video by ID
   */
  async getVideo(videoId: string): Promise<Video> {
    return this.get<Video>(`/v1/streams/${videoId}`);
  }

  /**
   * List videos with pagination
   */
  async listVideos(params?: ListVideosParams): Promise<ListVideosResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.status) query.set('status', params.status);

    return this.get<ListVideosResponse>(`/v1/streams?${query.toString()}`);
  }

  /**
   * Update video metadata
   */
  async updateVideo(
    videoId: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
    }
  ): Promise<Video> {
    return this.patch<Video>(`/v1/streams/${videoId}`, {
      metadata: updates,
    });
  }

  /**
   * Delete video
   */
  async deleteVideo(videoId: string): Promise<void> {
    await this.delete(`/v1/streams/${videoId}`);
  }

  /**
   * Get video insights
   */
  async getInsights(videoId: string): Promise<VideoInsights> {
    return this.get<VideoInsights>(`/v1/streams/${videoId}/insights`);
  }

  /**
   * Get video variants
   */
  async getVariants(videoId: string): Promise<VideoVariant[]> {
    const response = await this.get<{ variants: VideoVariant[] }>(
      `/v1/streams/${videoId}/variants`
    );
    return response.variants;
  }

  /**
   * Publish to CDN
   */
  async publish(videoId: string, params?: PublishParams): Promise<PublishResponse> {
    return this.post<PublishResponse>(`/v1/streams/${videoId}/publish`, params || {});
  }

  /**
   * Unpublish from CDN
   */
  async unpublish(videoId: string): Promise<void> {
    await this.post(`/v1/streams/${videoId}/unpublish`, {});
  }

  /**
   * Get player config
   */
  async getPlayerConfig(videoId: string): Promise<PlayerConfig> {
    return this.get<PlayerConfig>(`/v1/streams/${videoId}/player-config`);
  }

  /**
   * Wait for video to be ready
   */
  async waitForReady(
    videoId: string,
    options?: {
      timeout?: number; // ms
      pollInterval?: number; // ms
      onStatusChange?: (status: VideoStatus) => void;
    }
  ): Promise<Video> {
    const timeout = options?.timeout || 300000; // 5 minutes
    const pollInterval = options?.pollInterval || 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const video = await this.getVideo(videoId);

      if (options?.onStatusChange) {
        options.onStatusChange(video.status);
      }

      if (video.status === 'READY' || video.status === 'PUBLISHED') {
        return video;
      }

      if (video.status === 'FAILED') {
        throw new Error('Video processing failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Timeout waiting for video to be ready');
  }
}

