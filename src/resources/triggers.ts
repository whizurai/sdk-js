/**
 * Triggers resource — manage event-driven automations that execute
 * capabilities in response to platform events.
 */

import { AxiosInstance } from 'axios';
import {
  CreateTriggerInput,
  ListTriggersOptions,
  ListTriggersResponse,
  Trigger,
  TriggerTestResult,
  UpdateTriggerInput,
} from '../types';

export class TriggersResource {
  constructor(private readonly http: AxiosInstance) {}

  /** List triggers, optionally filtered by app/enabled state. */
  async list(options: ListTriggersOptions = {}): Promise<ListTriggersResponse> {
    const res = await this.http.get('/v1/triggers', { params: options });
    const data = res.data ?? {};
    const triggers: Trigger[] = data.triggers ?? [];
    return { triggers, count: data.count ?? triggers.length };
  }

  /** Fetch a single trigger by id. */
  async get(id: string): Promise<Trigger> {
    const res = await this.http.get(`/v1/triggers/${encodeURIComponent(id)}`);
    return res.data as Trigger;
  }

  /** Create a new trigger. */
  async create(input: CreateTriggerInput): Promise<Trigger> {
    const res = await this.http.post('/v1/triggers', input);
    return res.data as Trigger;
  }

  /** Update an existing trigger (partial). */
  async update(id: string, input: UpdateTriggerInput): Promise<Trigger> {
    const res = await this.http.put(`/v1/triggers/${encodeURIComponent(id)}`, input);
    return res.data as Trigger;
  }

  /** Delete a trigger. Resolves once the platform confirms removal. */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/v1/triggers/${encodeURIComponent(id)}`);
  }

  /** Fire a trigger against a sample event payload to validate it. */
  async test(id: string, payload: Record<string, unknown> = {}): Promise<TriggerTestResult> {
    const res = await this.http.post(`/v1/triggers/${encodeURIComponent(id)}/test`, payload);
    return res.data as TriggerTestResult;
  }
}
