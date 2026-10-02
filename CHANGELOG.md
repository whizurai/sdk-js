# Changelog

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
