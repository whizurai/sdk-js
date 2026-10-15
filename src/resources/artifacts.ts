/**
 * Artifacts resource — list and fetch artifacts produced by runs.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { Artifact, ListArtifactsResponse } from '../types';
import { WhizuraiError, errorForStatus } from '../errors';

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

  /**
   * Download an artifact's bytes via its resolved URL.
   *
   * Credentials are sent only to the gateway. A relative URL, or an absolute
   * URL on the gateway's own origin, goes through the authenticated client. An
   * absolute URL on any other origin (object storage, a CDN) is fetched with a
   * bare client that carries no `Authorization` or `X-API-Key`: the URL is
   * itself the bearer capability, and forwarding the platform key to a foreign
   * host would leak it. A redirect off the gateway is followed without
   * credentials for the same reason.
   */
  async download(id: string): Promise<ArrayBuffer> {
    const artifact = await this.get(id);
    const url = artifact.url ?? (artifact.metadata?.url as string | undefined);
    if (!url) {
      throw new WhizuraiError(`Artifact ${id} has no downloadable URL`, 'ARTIFACT_NO_URL');
    }
    return this.fetchBytes(url);
  }

  private gatewayOrigin(): string | undefined {
    const base = this.http.defaults?.baseURL;
    if (!base) return undefined;
    try {
      return new URL(base).origin;
    } catch {
      return undefined;
    }
  }

  private async fetchBytes(url: string, redirects = 0): Promise<ArrayBuffer> {
    const isAbsolute = /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url);
    const gateway = this.gatewayOrigin();
    let sameOrigin = !isAbsolute;
    if (isAbsolute) {
      try {
        sameOrigin = gateway !== undefined && new URL(url).origin === gateway;
      } catch {
        throw new WhizuraiError(`Artifact URL is not valid`, 'ARTIFACT_BAD_URL');
      }
    }

    if (!sameOrigin) {
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: {} });
        return res.data as ArrayBuffer;
      } catch (err) {
        throw this.mapBareError(err);
      }
    }

    // Gateway origin: authenticated, but never follow a redirect with credentials.
    const res = await this.http.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 0,
      validateStatus: (s: number) => (s >= 200 && s < 300) || (s >= 300 && s < 400),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers?.location as string | undefined;
      if (!location || redirects >= 5) {
        throw new WhizuraiError('Artifact download redirect could not be followed', 'ARTIFACT_REDIRECT');
      }
      const next = gateway ? new URL(location, gateway).toString() : location;
      return this.fetchBytes(next, redirects + 1);
    }
    return res.data as ArrayBuffer;
  }

  private mapBareError(err: unknown): Error {
    if (err instanceof WhizuraiError) return err;
    const e = err as AxiosError;
    const status = e?.response?.status;
    return errorForStatus(
      status,
      e?.message || 'Artifact download failed',
      status ? `HTTP_${status}` : 'NETWORK_ERROR',
      e?.response?.data
    );
  }
}
