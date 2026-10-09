# Changelog

## 3.2.0 (unreleased)

### Added

- Typed `speech:synthesize` shapes: `SPEECH_SYNTHESIZE`, `SpeechSynthesizeInput`,
  `SpeechSynthesizeResult`, `SpeechEngine`, `SpeechPriority`, `SpeechWarning`.
  No new endpoint: run it with `client.capabilities.run(SPEECH_SYNTHESIZE, input)`.
  The capability is flag-gated on the platform and ships as draft.
- `client.capabilities.cancel(runId)` for the existing
  `POST /v1/capabilities/capability-runs/:runId/cancel`. It marks the run and
  cancels its workflow run best-effort; stopping work already on a worker is a
  platform follow-up.

### Fixed

- Security: `client.artifacts.download` no longer sends `Authorization` or
  `X-API-Key` to a foreign origin. Absolute artifact URLs on another host
  (object storage, a CDN) are fetched with a bare client, and a redirect off the
  gateway is followed without credentials. Relative and same-origin URLs still
  use the authenticated client.

## 3.1.0 (unreleased)

### Added

- `client.chat(params, options?)` for model-router's OpenAI-compatible
  `POST /v1/chat/completions` (needs `inferenceBaseUrl`): required `model`
  (capability alias such as `structured-extraction`), `responseFormat`
  including `json_schema`, `reasoningEffort` / `chatTemplateKwargs`, tools, and
  `execution` attribution typed on the response. `executionPolicy` / `priority`
  options are sent as `x-execution-policy` / `x-priority`.
- Types: `ChatParams`, `ChatCallOptions`, `ChatMessage`, `ChatCompletionRequest`,
  `ChatCompletionResponse`, `ChatExecution`, `ChatResolution`,
  `ChatResponseFormat`, `ExecutionPolicy`; constant `STRUCTURED_EXTRACTION_MODEL`.

### Fixed

- CI: `pnpm lint` had failed on every run because `eslint` was never a
  devDependency. Added ESLint 9 + typescript-eslint (flat config). CI and
  publish now run on the `arc-whizurai` self-hosted runners with
  `--frozen-lockfile`; publish is gated on lint/typecheck/test.

## 3.0.0 (unreleased)

### Breaking

- `EmbeddingsClient` no longer defaults to `text-embedding-3-small`. `embed()`
  (and `search()` with a text query) throws unless `request.model` or
  `config.defaultModel` is set. The model fixes the vector space, so it must be
  an explicit choice — e.g. `embedding-qwen3-0.6b-v1`.
- Axios timeouts (`ECONNABORTED`/`ETIMEDOUT`, no response) now reject with
  `TimeoutError` (code `TIMEOUT`) instead of a `WhizuraiError` with code
  `NETWORK_ERROR`.

### Added

- `client.embed()` and `client.rerank()` for model-router's `POST /v1/embeddings`
  and `POST /v1/rerank`, with `whizai` provenance, and the new
  `inferenceBaseUrl` client option they require.
- `rerank(..., { fallback: 'original-order', timeoutMs })` degradation mode.
- `assertSameEmbeddingSpace()`, `embeddingSpaceOf()`, `EmbeddingSpaceError`.
- `EmbeddingsClient` responses carry `whizai` and `embeddingSpace`; `search()`
  embeds the query with `input_type: 'query'`.
- Error messages are read from FastAPI `detail` bodies as well as
  `error`/`message`.
