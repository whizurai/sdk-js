/**
 * Artifacts resource — list and fetch artifacts produced by runs.
 */

import { AxiosInstance } from 'axios';
import { Artifact, ListArtifactsResponse } from '../types';
import { WhizuraiError } from '../errors';

export interface ListArtifactsOptions {
  runId?: string;
  stepId?: string;
  type?: string;
  query?: string;
  labels?: string;
  limit?: number;
  offset?: number;
}

export class ArtifactsResource {
  constructor(private readonly http: AxiosInstance) {}

  /** List artifacts, optionally scoped to a run/type/query. */
  async list(options: ListArtifactsOptions = {}): Promise<ListArtifactsResponse> {
    const res = await this.http.get('/v1/artifacts', { params: options });
    const data = res.data ?? {};
    const artifacts: Artifact[] = data.artifacts ?? [];
    const count = data.count ?? artifacts.length;
    return { artifacts, count, total: data.total ?? count };
  }

  /** Fetch a single artifact by id. */
  async get(id: string): Promise<Artifact> {
    const res = await this.http.get(`/v1/artifacts/${encodeURIComponent(id)}`);
    return res.data as Artifact;
  }

  /** Download an artifact's bytes via its resolved URL. */
  async download(id: string): Promise<ArrayBuffer> {
    const artifact = await this.get(id);
    const url = artifact.url ?? (artifact.metadata?.url as string | undefined);
    if (!url) {
      throw new WhizuraiError(`Artifact ${id} has no downloadable URL`, 'ARTIFACT_NO_URL');
    }
    // Absolute URLs bypass the configured baseURL; relative ones go through the gateway.
    const res = await this.http.get(url, { responseType: 'arraybuffer' });
    return res.data as ArrayBuffer;
  }
}
