# @whizurai/sdk-js

Official TypeScript/JavaScript SDK for the Whizurai Platform.

## Installation

```bash
npm install @whizurai/sdk-js
# or
pnpm add @whizurai/sdk-js
# or
yarn add @whizurai/sdk-js
```

## Quick Start

```typescript
import { WhizuraiClient } from '@whizurai/sdk-js';

const client = new WhizuraiClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.whizurai.com' // Optional, defaults to https://api.whizurai.com
});
```

## Capabilities

Capabilities are productized AI services that you can execute directly.

### List Capabilities

```typescript
// List all published capabilities
const { capabilities, total } = await client.capabilities.list({
  status: 'published',
  category: 'video',
  limit: 20
});

console.log(`Found ${total} capabilities`);
```

### Get Capability

```typescript
// Get capability by ID or slug
const capability = await client.capabilities.get('guzzyworld:seasonal-cards/valentine');
// or
const capability = await client.capabilities.get('cap_abc123');

console.log(capability.name, capability.description);
```

### Execute Capability

```typescript
// Execute a capability (creates a run)
const { run } = await client.capabilities.run('cap_abc123', {
  imageUrl: 'https://example.com/image.jpg',
  message: 'Happy Valentine\'s Day!'
}, {
  idempotencyKey: 'unique-key-123' // Optional: ensures idempotency
});

console.log(`Run started: ${run.id}`);
console.log(`Status: ${run.status}`);
```

## Runs

Runs represent executions of capabilities. All capability executions create runs.

### Get Run Status

```typescript
const run = await client.runs.get('run_abc123');

console.log(`Status: ${run.status}`);
console.log(`Capability: ${run.capabilityId}`);
if (run.output) {
  console.log('Output:', run.output);
}
```

### List Runs

```typescript
// List runs with filters
const { runs, total } = await client.runs.list({
  capabilityId: 'cap_abc123',
  status: 'succeeded',
  limit: 50
});

runs.forEach(run => {
  console.log(`${run.id}: ${run.status}`);
});
```

### Poll Until Completion

```typescript
// Poll a run until it completes
const completed = await client.runs.pollUntilDone('run_abc123', {
  interval: 2000,        // Poll every 2 seconds
  timeout: 600000,      // Timeout after 10 minutes
  onStatus: (run) => {   // Optional: callback for status updates
    console.log(`Status: ${run.status}`);
  }
});

if (completed.status === 'succeeded') {
  console.log('Run completed successfully!');
  console.log('Output:', completed.output);
} else {
  console.error('Run failed:', completed.error);
}
```

### Get Run Logs

```typescript
const logs = await client.runs.logs('run_abc123');
logs.forEach(log => console.log(log));
```

## Artifacts

Artifacts are outputs from runs (images, videos, files, etc.).

### List Artifacts

```typescript
// List artifacts for a run
const { artifacts, total } = await client.artifacts.list({
  runId: 'run_abc123',
  type: 'image',
  limit: 20
});

console.log(`Found ${total} artifacts`);
```

### Get Artifact

```typescript
const artifact = await client.artifacts.get('art_abc123');

console.log(`Type: ${artifact.type}`);
console.log(`URL: ${artifact.url}`);
console.log(`Labels:`, artifact.labels);
```

### Download Artifact

```typescript
// Download artifact content
const blob = await client.artifacts.download('art_abc123');

// In Node.js
const fs = require('fs');
const buffer = Buffer.from(await blob.arrayBuffer());
fs.writeFileSync('output.jpg', buffer);

// In browser
const url = URL.createObjectURL(blob);
const img = document.createElement('img');
img.src = url;
```

## Triggers

Triggers automate capability execution based on events.

### List Triggers

```typescript
const { triggers } = await client.triggers.list({
  enabled: true
});

triggers.forEach(trigger => {
  console.log(`${trigger.name}: ${trigger.eventType}`);
});
```

### Create Trigger

```typescript
// Create a trigger that executes a capability when an artifact is created
const trigger = await client.triggers.create({
  name: 'Auto-process uploads',
  description: 'Process images automatically when uploaded',
  eventType: 'artifact.created',
  filters: {
    type: 'image',
    labels: { category: 'user-upload' }
  },
  actionType: 'execute_capability',
  actionConfig: {
    capabilityId: 'cap_abc123',
    inputMapping: {
      imageUrl: '{{artifact.url}}',
      source: '{{artifact.labels.source}}'
    }
  },
  enabled: true
});

console.log(`Trigger created: ${trigger.id}`);
```

### Update Trigger

```typescript
await client.triggers.update('trig_abc123', {
  enabled: false,
  filters: {
    type: 'image',
    labels: { category: 'user-upload', priority: 'high' }
  }
});
```

### Delete Trigger

```typescript
await client.triggers.delete('trig_abc123');
```

### Test Trigger

```typescript
// Test a trigger with sample event data
const result = await client.triggers.test('trig_abc123', {
  artifact: {
    id: 'art_test',
    url: 'https://example.com/test.jpg',
    type: 'image',
    labels: { category: 'user-upload' }
  }
});

if (result.success) {
  console.log('Trigger executed successfully');
  console.log('Created run:', result.result?.runId);
}
```

## Complete Example

```typescript
import { WhizuraiClient } from '@whizurai/sdk-js';

const client = new WhizuraiClient({
  apiKey: process.env.WHIZURAI_API_KEY!,
});

async function processImage() {
  // 1. List available capabilities
  const { capabilities } = await client.capabilities.list({
    status: 'published',
    category: 'image-processing'
  });

  // 2. Execute a capability
  const { run } = await client.capabilities.run(capabilities[0].id, {
    imageUrl: 'https://example.com/photo.jpg',
    style: 'vintage'
  }, {
    idempotencyKey: `process-${Date.now()}`
  });

  // 3. Poll until completion
  const completed = await client.runs.pollUntilDone(run.id);

  // 4. Get artifacts
  const { artifacts } = await client.artifacts.list({
    runId: completed.id
  });

  // 5. Download result
  if (artifacts.length > 0) {
    const blob = await client.artifacts.download(artifacts[0].id);
    console.log('Downloaded:', artifacts[0].name);
  }
}

processImage().catch(console.error);
```

> **Note:** The low-level AI verbs (`generate`, `enrich`, `search`, `moderate`,
> `recommend`) are no longer part of the public client. Use the corresponding
> published capabilities (e.g. `client.capabilities.run('text.generate', …)`)
> instead — capabilities wrap those primitives with validation, routing, and
> artifact tracking.

## Embeddings and Rerank

Direct inference against `POST /v1/embeddings` and `POST /v1/rerank`.
Responses keep their wire shape (snake_case), including the optional `whizai`
provenance block.

### Embed

`model` is **required** — there is no default, because the model fixes the
vector space. Use a pinned alias such as `embedding-qwen3-0.6b-v1`.

```typescript
const res = await client.embed({
  model: 'embedding-qwen3-0.6b-v1',
  input: ['late night tacos', 'jazz brunch'], // string or up to 128 strings
  inputType: 'document',                    // or 'query' (default 'document')
  instruction: 'Represent the listing for retrieval', // optional
});

res.data[0].embedding;          // number[]
res.whizai?.embedding_space;    // 'qwen3-embedding-0.6b:<rev>:1024:normalized:qwen3-embed-instruct-v1'
res.whizai?.model_revision;     // string | null
res.whizai?.worker;             // { id, name } when attributable
```

**Never compare vectors across `embedding_space` values.** Store the space next
to every vector, and check it before computing similarity:

```typescript
import { assertSameEmbeddingSpace } from '@whizurai/sdk-js';

// Throws EmbeddingSpaceError if the spaces differ, or if either is missing
// or contains 'unknown'. Accepts strings, provenance blocks or responses.
assertSameEmbeddingSpace(storedSpace, queryRes);
```

Older non-fleet models (e.g. `nomic-embed-text`) return no `embedding_space`;
the guard treats that as non-comparable, not as a wildcard.

### Rerank

```typescript
const ranked = await client.rerank({
  model: 'rerank-qwen3-0.6b-v1',
  query: 'live music tonight',
  documents: ['doc a', 'doc b', 'doc c'], // 1..64
  topN: 2,
});
ranked.results; // [{ index, relevance_score }] sorted by score, descending
```

Without options, `rerank()` throws on any failure (the platform fails fast
with 503/504 when no worker is available or the call times out).

### Rerank fallback mode

A reranker should never be a correctness dependency. With
`fallback: 'original-order'`, a timeout, network error, 408, 429 or 5xx resolves
instead of throwing:

```typescript
const out = await client.rerank(
  { model: 'rerank-qwen3-0.6b-v1', query, documents },
  { fallback: 'original-order', timeoutMs: 1500 }
);

if (out.degraded) {
  // out.results: [{ index: 0, relevance_score: null }, { index: 1, ... }, ...]
  // (original order, truncated to topN when given)
  log.warn('rerank degraded', out.reason, out.error); // reason: 'timeout' | 'network_error' | 'http_503' | ...
}
```

Validation and auth errors (400, 401, 403, 404, 422) **always throw**, even in
fallback mode — they are caller bugs, not outages.

### Legacy `EmbeddingsClient`

The standalone `EmbeddingsClient` (`src/ai`) no longer defaults to
`text-embedding-3-small`. Pass `model` per request or set `defaultModel`
explicitly; otherwise `embed()` throws. Its response now carries `whizai` and
`embeddingSpace` when the server returns them.

## Error Handling

The SDK throws typed errors for different scenarios. All extend `WhizuraiError`,
which carries `status` and `code`:

```typescript
import {
  WhizuraiError,
  NotFoundError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
} from '@whizurai/sdk-js';

try {
  await client.capabilities.run('invalid-id', {});
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Capability not found');
  } else if (error instanceof AuthenticationError) {
    console.error('Check your API key');
  } else if (error instanceof WhizuraiError) {
    console.error(`Platform error ${error.status} (${error.code}):`, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Idempotency

All methods that create resources support idempotency:

```typescript
// Execute with idempotency key
const { run } = await client.capabilities.run('cap_123', input, {
  idempotencyKey: 'unique-key-123'
});

// Calling again with the same key returns the same run
const { run: sameRun } = await client.capabilities.run('cap_123', input, {
  idempotencyKey: 'unique-key-123'
});

console.log(run.id === sameRun.id); // true
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  Capability,
  Run,
  Artifact,
  Trigger,
  ListCapabilitiesOptions,
  ExecuteCapabilityOptions
} from '@whizurai/sdk-js';

const options: ListCapabilitiesOptions = {
  status: 'published',
  limit: 10
};

const { capabilities } = await client.capabilities.list(options);
const capability: Capability = capabilities[0];
```

## Authentication

The SDK uses API key authentication. Get your API key from the [Whizurai Dashboard](https://dashboard.whizurai.com).

```typescript
const client = new WhizuraiClient({
  apiKey: process.env.WHIZURAI_API_KEY!,
  baseUrl: 'https://api.whizurai.com' // Optional
});
```

## What's NOT Available

The default `WhizuraiClient` does **NOT** expose:
- ❌ `client.workflows.run()` - Use `client.capabilities.run()` instead
- ❌ `client.workflows.create()` - Admin operation
- ❌ `client.capabilities.create()` - Admin operation

For admin operations, use `WhizuraiAdminClient` (separate import).

## Documentation

- [Full API Documentation](https://docs.whizurai.com)
- [SDK Contract](./docs/SDK_CONTRACT.md)
- [SDK Surface Design](./docs/SDK_SURFACE_DESIGN.md)
- [Examples](https://github.com/whizurai/examples)

## License

MIT
