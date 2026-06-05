/**
 * Public Surface Snapshot Test
 *
 * Ensures the default WhizuraiClient exposes ONLY the capability-first surface
 * (capabilities, runs, artifacts, triggers) and never the admin/workflow surface
 * (workflows.run(), workflowRuns.create(), capability CRUD).
 *
 * The properties probed here (workflows, workflowRuns, capability CRUD) do not
 * exist on the WhizuraiClient type — accessing them through an untyped alias is
 * intentional: the absence is now enforced by the type system AND asserted at
 * runtime.
 */

import { WhizuraiClient } from '../../src/index';

function makeClient(): WhizuraiClient {
  return new WhizuraiClient({
    apiKey: 'test-key',
    baseUrl: 'http://localhost:3000',
  });
}

describe('Public Surface Snapshot Test', () => {
  it('should NOT export workflows.run() in WhizuraiClient', () => {
    const client = makeClient() as unknown as Record<string, { run?: unknown } | undefined>;
    expect(client.workflows).toBeUndefined();
    if (client.workflows) {
      expect(client.workflows.run).toBeUndefined();
    }
  });

  it('should NOT export workflowRuns.create() in WhizuraiClient', () => {
    const client = makeClient() as unknown as Record<string, { create?: unknown } | undefined>;
    expect(client.workflowRuns).toBeUndefined();
    if (client.workflowRuns) {
      expect(client.workflowRuns.create).toBeUndefined();
    }
  });

  it('should NOT export capabilities CRUD in WhizuraiClient', () => {
    const client = makeClient();
    const capabilities = client.capabilities as unknown as Record<string, unknown>;
    expect(capabilities.create).toBeUndefined();
    expect(capabilities.update).toBeUndefined();
    expect(capabilities.delete).toBeUndefined();
    expect(capabilities.publish).toBeUndefined();
    expect(capabilities.deprecate).toBeUndefined();
  });

  it('should ONLY export capability-first resources in WhizuraiClient', () => {
    const client = makeClient();

    const expectedResources = ['capabilities', 'runs', 'artifacts', 'triggers'];

    const clientKeys = Object.keys(client).filter(
      (key) =>
        !key.startsWith('_') &&
        typeof (client as unknown as Record<string, unknown>)[key] === 'object'
    );

    expectedResources.forEach((resource) => {
      expect(clientKeys).toContain(resource);
    });

    expect(clientKeys).not.toContain('workflows');
    expect(clientKeys).not.toContain('workflowRuns');
  });

  it('should not expose a workflows.run() escape hatch', () => {
    const client = makeClient() as unknown as {
      workflows?: { run?: (...args: unknown[]) => unknown };
    };

    if (client.workflows && typeof client.workflows.run === 'function') {
      expect(() => {
        client.workflows!.run!({
          appId: 'test-app',
          workflowSlug: 'test-workflow',
          input: {},
        });
      }).toThrow(/workflow execution forbidden|use.*capabilities\.run/i);
    } else {
      expect(client.workflows).toBeUndefined();
    }
  });
});
