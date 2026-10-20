# Changelog

## 3.3.0 (unreleased)

### Added

- `client.generateText(params, options?)` for the gateway's
  `POST /v1/generate/text` and `client.describeImage(params, options?)` for
  `POST /v1/images/describe`. Both go to `baseUrl` (the api-gateway), not
  model-router: the gateway takes the app from the key, rate-limits, and leases
  the work on the fleet under that app's policy. Declare `metadata.priority`
  (`interactive` only where a person waits and the app's policy grants it).
  `describeImage` takes exactly one of `image` (base64) or `imageUrl`; `model`
  names an exact model, omitted runs the `vision` alias. `options.timeoutMs`
  sets the HTTP timeout for that call. Responses are the wire shape. Types:
  `GenerateTextRequest`, `GenerateTextResponse`, `GenerateTextExecution`,
  `DescribeImageRequest`, `DescribeImageResponse`, `GatewayRequestMetadata`,
  `GatewayCallOptions`, `PriorityClass`, `GatewayReasoningEffort`
  (mirroring `@whizurai/types/gateway-inference` 1.4.0).
- Typed `speech:synthesize` shapes: `SPEECH_SYNTHESIZE`, `SpeechSynthesizeInput`,
  `SpeechSynthesizeResult`, `SpeechEngine`, `SpeechPriority`, `SpeechWarning`.
  No new endpoint: run it with `client.capabilities.run(SPEECH_SYNTHESIZE, input)`.
- `client.capabilities.cancel(runId)` for the existing
  `POST /v1/capabilities/capability-runs/:runId/cancel`. It marks the run and
  cancels its workflow run best-effort.
- `speech:synthesize` results carry word timing for read-along: `words`
  (`SpeechWordTiming[]`: `startMs`, `endMs`, `charStart`, `charEnd` in the text
  as sent; no word text) and `timing` (`SpeechTimingProvenance`: `engine` or
  `aligned`, the aligner model, a confidence). Optional and nullable: absent
  from older platforms, `null` when no timing was established.
- `speech:synthesize` third engine `qwen3-tts` (Qwen3-TTS 1.7B Base, voice
  cloning). `SpeechEngine` gains `'qwen3-tts'`; `SpeechSynthesizeInput` gains
  `referenceText` (the exact transcript of the reference recording). For
  `qwen3-tts`, `referenceAudioArtifactId` and `referenceText` are required and
  `voice`, `speed`, `exaggeration`, `cfgWeight` are refused; `referenceText` is
  refused for the other engines. The platform enforces this (400
  `invalid_option`); the SDK does not validate capability input.
- `SpeechSynthesizeResult` gains `referenceAudioSha256` and
  `referenceTextSha256` (`string | null`): hashes of the reference audio and
  transcript the worker actually used. `null` when no reference was used;
  never `null` for `qwen3-tts`. `servedVoice` is `reference` and `watermark` is
  `null` for `qwen3-tts`.
- `client.transcribe(params, options?)` for model-router's
  `POST /v1/audio/transcriptions` (needs `inferenceBaseUrl`). Exactly one of
  `fileUrl`, `file` (base64) or `artifactId`; `model`, `language`, `prompt`,
  `responseFormat`, `temperature`, `timestampGranularities`, `provider`,
  `metadata` map to the snake_case wire. `options` sends `x-execution-policy`,
  `x-priority` and `x-request-timeout-ms` like `chat()`. A `202` (only with
  `metadata.idempotencyKey`) rejects with code `TRANSCRIPTION_PENDING` and
  `details: { jobId, state }`. Types: `TranscribeParams`,
  `TranscribeCallOptions`, `AudioTranscriptionRequest`,
  `AudioTranscriptionResponse`, `AudioTranscriptionPending`,
  `TranscriptionSegment`, `TranscriptionResponseFormat`.

### Fixed

- The default `baseUrl` is now `https://api.whizur.ai`. It was
  `https://api.whizurai.com`, which does not resolve, so a client created without
  `baseUrl` could not connect.
- `SPEECH_SYNTHESIZE` and `VIDEO_MULTI_SHOT` are now exported as values from
  the package root. They were only reachable as types (`export type *`), so
  `capabilities.run(SPEECH_SYNTHESIZE, ...)` did not compile against 3.2.0.

## 3.2.1

### Fixed

- `artifacts.download()` sent the platform's `Authorization` / `X-API-Key` to whatever host the
  artifact URL named. Object storage rejects that (MinIO: `400 invalid header: authorization`), so
  every download from `api.minio.cheddarwhizzy.com` failed, and a foreign host would have received
  the key. Credentials now go only to the gateway's own origin. Any other absolute URL is fetched
  bare, and a redirect off the gateway is followed without them. (Ported from draft #12.)

## 3.2.0 (unreleased)

### Added

- `capabilities.run()` options the platform's execute endpoint reads but the SDK
  could not send: `executionMode`, `runFlags` (`executionProfile`, `callbackUrl`,
  `providerAttemptPolicy`, …), `mock`, per-request `headers` (e.g.
  `x-correlation-id`; `Authorization`/`X-API-Key` are dropped) and `timeout`.
  Without `runFlags.executionProfile` the platform defaults a run to the mock
  provider, so real callers need it.
- `runs.artifacts(runId, { grouped: false })` for the ungrouped view, where each
  entry carries `role: 'input' | 'output'`. The grouped default is unchanged; it
  includes inputs and reports `roles[]`, so a caller looking for outputs has to
  filter on one or the other.
- `Artifact.role` and `Artifact.roles` are now typed.

### Fixed

- `capabilities.run({ webhookUrl })` did nothing: the platform reads the
  completion webhook only from `runFlags.callbackUrl` and ignores a top-level
  `webhookUrl`. It is now sent as `runFlags.callbackUrl`; an explicit
  `runFlags.callbackUrl` wins.

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
