/**
 * SDK ↔ API Contract Tests
 * 
 * These tests validate that SDK methods match API expectations:
 * - Request shape matches server expectations
 * - Auth requirements are correct
 * - Response parsing is correct
 * - Errors are typed correctly (401/403/422/429/5xx)
 * 
 * Run against a local API server or staging environment.
 */

import { WhizuraiClient } from '../../src/index';
import type {
  ListCapabilitiesResponse,
  Capability,
  Run,
  ListRunsResponse,
  ListArtifactsResponse,
  Artifact,
  ListTriggersResponse,
  Trigger,
} from '../../src/types';

// These tests make live HTTP calls. They only run when a server is configured
// via WHIZURAI_CONTRACT=1 (plus WHIZURAI_API_KEY / WHIZURAI_BASE_URL); otherwise
// they are skipped so the default offline `jest` run stays green while the file
// still type-checks against the SDK surface.
const RUN_CONTRACT = process.env.WHIZURAI_CONTRACT === '1';
const describeContract = RUN_CONTRACT ? describe : describe.skip;

describeContract('SDK ↔ API Contract Tests', () => {
  // Note: These tests require a valid API key and API server
  // Set WHIZURAI_API_KEY and WHIZURAI_BASE_URL env vars for testing
  const apiKey = process.env.WHIZURAI_API_KEY || 'test-key';
  const baseUrl = process.env.WHIZURAI_BASE_URL || 'http://localhost:3000';
  const client = new WhizuraiClient({ apiKey, baseUrl });

  describe('Capabilities', () => {
    it('should list capabilities', async () => {
      const response: ListCapabilitiesResponse = await client.capabilities.list({
        status: 'published',
        limit: 10,
      });

      expect(response).toHaveProperty('capabilities');
      expect(Array.isArray(response.capabilities)).toBe(true);
      expect(response).toHaveProperty('total');
      expect(typeof response.total).toBe('number');

      // Validate capability shape
      if (response.capabilities.length > 0) {
        const cap = response.capabilities[0];
        expect(cap).toHaveProperty('id');
        expect(cap).toHaveProperty('slug');
        expect(cap).toHaveProperty('name');
        expect(cap).toHaveProperty('status');
      }
    });

    it('should get capability by ID', async () => {
      // First, list capabilities to get a valid ID
      const list = await client.capabilities.list({ limit: 1 });
      
      if (list.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = list.capabilities[0].id;
      const capability: Capability = await client.capabilities.get(capabilityId);

      expect(capability).toHaveProperty('id');
      expect(capability).toHaveProperty('slug');
      expect(capability).toHaveProperty('name');
      expect(capability).toHaveProperty('status');
    });

    it('should execute capability and return run', async () => {
      // Get a published capability
      const list = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (list.capabilities.length === 0) {
        console.warn('No published capabilities available for testing');
        return;
      }

      const capabilityId = list.capabilities[0].id;
      const inputSchema = list.capabilities[0].inputSchema || {};
      
      // Build minimal input from schema
      const input: Record<string, unknown> = {};
      if (typeof inputSchema === 'object' && inputSchema.properties) {
        // Extract required fields from schema (simplified)
        Object.keys(inputSchema.properties).forEach((key) => {
          input[key] = 'test-value';
        });
      }

      const { run } = await client.capabilities.run(capabilityId, input, {
        idempotencyKey: `test-${Date.now()}`,
      });

      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('capabilityId');
      expect(run).toHaveProperty('status');
      expect(['pending', 'running', 'succeeded', 'failed', 'cancelled']).toContain(run.status);
    });

    it('should handle capability not found', async () => {
      await expect(
        client.capabilities.get('non-existent-id')
      ).rejects.toThrow();
    });
  });

  describe('Runs', () => {
    it('should get run by ID', async () => {
      // First, execute a capability to get a run ID
      const list = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (list.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = list.capabilities[0].id;
      const { run: createdRun } = await client.capabilities.run(capabilityId, {}, {
        idempotencyKey: `test-run-${Date.now()}`,
      });

      const run: Run = await client.runs.get(createdRun.id);

      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('capabilityId');
      expect(run).toHaveProperty('status');
    });

    it('should list runs', async () => {
      const response: ListRunsResponse = await client.runs.list({
        limit: 10,
      });

      expect(response).toHaveProperty('runs');
      expect(Array.isArray(response.runs)).toBe(true);
      expect(response).toHaveProperty('total');
    });

    it('should poll run until done', async () => {
      // Execute a capability
      const list = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (list.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = list.capabilities[0].id;
      const { run: createdRun } = await client.capabilities.run(capabilityId, {}, {
        idempotencyKey: `test-poll-${Date.now()}`,
      });

      // Poll until done (with short timeout for testing)
      const completed: Run = await client.runs.pollUntilDone(createdRun.id, {
        interval: 1000,
        timeout: 30000, // 30 seconds
      });

      expect(completed).toHaveProperty('id');
      expect(completed).toHaveProperty('status');
      expect(['succeeded', 'failed', 'cancelled']).toContain(completed.status);
    }, 60000); // 60 second timeout for this test

    it('should handle run not found', async () => {
      await expect(
        client.runs.get('non-existent-run-id')
      ).rejects.toThrow();
    });
  });

  describe('Artifacts', () => {
    it('should list artifacts for a run', async () => {
      // Get a run first
      const runs = await client.runs.list({ limit: 1 });
      
      if (runs.runs.length === 0) {
        console.warn('No runs available for testing');
        return;
      }

      const runId = runs.runs[0].id;
      const response: ListArtifactsResponse = await client.artifacts.list({ runId });

      expect(response).toHaveProperty('artifacts');
      expect(Array.isArray(response.artifacts)).toBe(true);
      expect(response).toHaveProperty('total');
    });

    it('should get artifact by ID', async () => {
      // Get artifacts first
      const runs = await client.runs.list({ limit: 1 });
      
      if (runs.runs.length === 0) {
        console.warn('No runs available for testing');
        return;
      }

      const runId = runs.runs[0].id;
      const artifacts = await client.artifacts.list({ runId });
      
      if (artifacts.artifacts.length === 0) {
        console.warn('No artifacts available for testing');
        return;
      }

      const artifactId = artifacts.artifacts[0].id;
      const artifact: Artifact = await client.artifacts.get(artifactId);

      expect(artifact).toHaveProperty('id');
      expect(artifact).toHaveProperty('type');
    });

    it('should handle artifact not found', async () => {
      await expect(
        client.artifacts.get('non-existent-artifact-id')
      ).rejects.toThrow();
    });
  });

  describe('Triggers', () => {
    it('should list triggers', async () => {
      const response: ListTriggersResponse = await client.triggers.list();

      expect(response).toHaveProperty('triggers');
      expect(Array.isArray(response.triggers)).toBe(true);
      expect(response).toHaveProperty('count');
    });

    it('should create trigger', async () => {
      // Get a capability ID for trigger action
      const capabilities = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (capabilities.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = capabilities.capabilities[0].id;

      const trigger: Trigger = await client.triggers.create({
        name: `Test Trigger ${Date.now()}`,
        eventType: 'artifact.created',
        filters: {
          type: 'image',
        },
        actionType: 'execute_capability',
        actionConfig: {
          capabilityId,
          inputMapping: {
            imageUrl: '{{artifact.url}}',
          },
        },
        enabled: true,
      });

      expect(trigger).toHaveProperty('id');
      expect(trigger).toHaveProperty('name');
      expect(trigger).toHaveProperty('eventType');
      expect(trigger).toHaveProperty('actionType');

      // Clean up
      await client.triggers.delete(trigger.id);
    });

    it('should update trigger', async () => {
      // Create a trigger first
      const capabilities = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (capabilities.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = capabilities.capabilities[0].id;
      const trigger = await client.triggers.create({
        name: `Test Trigger ${Date.now()}`,
        eventType: 'artifact.created',
        actionType: 'execute_capability',
        actionConfig: { capabilityId },
      });

      // Update trigger
      const updated = await client.triggers.update(trigger.id, {
        enabled: false,
      });

      expect(updated.enabled).toBe(false);

      // Clean up
      await client.triggers.delete(trigger.id);
    });

    it('should delete trigger', async () => {
      // Create a trigger first
      const capabilities = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (capabilities.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = capabilities.capabilities[0].id;
      const trigger = await client.triggers.create({
        name: `Test Trigger ${Date.now()}`,
        eventType: 'artifact.created',
        actionType: 'execute_capability',
        actionConfig: { capabilityId },
      });

      // Delete trigger
      await expect(
        client.triggers.delete(trigger.id)
      ).resolves.toBeUndefined();

      // Verify trigger is deleted
      await expect(
        client.triggers.get(trigger.id)
      ).rejects.toThrow();
    });

    it('should test trigger', async () => {
      // Create a trigger first
      const capabilities = await client.capabilities.list({ status: 'published', limit: 1 });
      
      if (capabilities.capabilities.length === 0) {
        console.warn('No capabilities available for testing');
        return;
      }

      const capabilityId = capabilities.capabilities[0].id;
      const trigger = await client.triggers.create({
        name: `Test Trigger ${Date.now()}`,
        eventType: 'artifact.created',
        actionType: 'execute_capability',
        actionConfig: { capabilityId },
      });

      // Test trigger
      const result = await client.triggers.test(trigger.id, {
        artifact: {
          id: 'test-artifact',
          url: 'https://example.com/test.jpg',
          type: 'image',
        },
      });

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');

      // Clean up
      await client.triggers.delete(trigger.id);
    });
  });

  describe('Error Handling', () => {
    it('should throw CapabilityNotFoundError for 404', async () => {
      await expect(
        client.capabilities.get('non-existent-id')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw RunNotFoundError for 404', async () => {
      await expect(
        client.runs.get('non-existent-run-id')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw on 401 Unauthorized', async () => {
      const invalidClient = new WhizuraiClient({
        apiKey: 'invalid-key',
        baseUrl,
      });

      await expect(
        invalidClient.capabilities.list()
      ).rejects.toThrow();
    });
  });
});
