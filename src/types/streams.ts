/**
 * Type definitions for Streams SDK
 */

export type VideoStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'QUEUED'
  | 'TRANSCODING'
  | 'ENRICHING'
  | 'ANALYZING'
  | 'READY'
  | 'PUBLISHED'
  | 'FAILED'
  | 'DELETED';

export interface Video {
  id: string;
  status: VideoStatus;
  originalFilename: string;
  fileSize: number;
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  storageKey: string;
  cdnUrl?: string;
  uploadedAt?: string;
  processedAt?: string;
  publishedAt?: string;
  variants: VideoVariant[];
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface VideoVariant {
  id: string;
  resolution: string; // "1080p", "720p", etc.
  format: string; // "hls", "dash", "mp4"
  bitrate: number;
  codec: string;
  storageKey: string;
  cdnUrl?: string;
  fileSize?: number;
  url: string;
}

export interface VideoInsights {
  videoId: string;
  scenes: Scene[];
  highlights: Highlight[];
  aestheticScore: number;
  aestheticBreakdown: {
    composition: number;
    colorHarmony: number;
    lighting: number;
    motionSmoothness: number;
    visualInterest: number;
  };
  viralityMarkers: {
    predictedEngagement: number;
    hookStrength: number;
    retentionCurve: number[];
    shareability: number;
    emotionalPeaks: EmotionalPeak[];
  };
  transcription?: {
    text: string;
    language: string;
    segments: TranscriptSegment[];
  };
  objects: string[];
  faces: number;
  tags: string[];
  categories: string[];
  description?: string;
  sentiment?: string;
  processingTime: number;
  modelVersions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  sceneId: string;
  startTime: number;
  endTime: number;
  duration: number;
  type: string;
  dominantColors: string[];
  motionLevel: string;
  brightness: number;
  thumbnailUrl?: string;
}

export interface Highlight {
  highlightId: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  reason: string;
  suggestedTitle?: string;
}

export interface EmotionalPeak {
  timestamp: number;
  emotion: string;
  intensity: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface PlayerConfig {
  videoId: string;
  playlistUrl: string;
  posterUrl?: string;
  title?: string;
  duration?: number;
  width?: number;
  height?: number;
  autoplay?: boolean;
  controls?: boolean;
  responsive?: boolean;
}

// Request/Response types
export interface CreateUploadUrlParams {
  filename: string;
  fileSize: number;
  contentType: string;
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
  };
}

export interface CreateUploadUrlResponse {
  videoId: string;
  uploadUrl: string;
  expiresAt: string;
  maxFileSize: number;
  allowedFormats: string[];
}

export interface ListVideosParams {
  limit?: number;
  cursor?: string;
  status?: VideoStatus;
}

export interface ListVideosResponse {
  data: Video[];
  pagination: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface PublishParams {
  regions?: string[];
  webhookUrl?: string;
}

export interface PublishResponse {
  videoId: string;
  status: VideoStatus;
  cdnUrl: string;
  regions: string[];
  publishedAt: string;
}

