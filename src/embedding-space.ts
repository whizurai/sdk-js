/**
 * Embedding-space guard.
 *
 * Vectors from different models, revisions, dimensions, normalization or prompt
 * contracts live in different spaces: their cosine similarity is a number, but
 * it means nothing. Never compare vectors across `embedding_space` values.
 */

import { WhizuraiError } from './errors';
import type { EmbeddingProvenance, EmbeddingsResponse } from './types';

export class EmbeddingSpaceError extends WhizuraiError {
  constructor(message: string, code: 'EMBEDDING_SPACE_UNKNOWN' | 'EMBEDDING_SPACE_MISMATCH') {
    super(message, code);
    this.name = 'EmbeddingSpaceError';
  }
}

/** Anything that carries an embedding space: the string, a provenance block, or a response. */
export type EmbeddingSpaceSource =
  | string
  | Pick<EmbeddingProvenance, 'embedding_space'>
  | Pick<EmbeddingsResponse, 'whizai'>
  | null
  | undefined;

/** Extract the `embedding_space` string from a string, provenance block or response. */
export function embeddingSpaceOf(source: EmbeddingSpaceSource): string | undefined {
  if (source == null) return undefined;
  if (typeof source === 'string') return source;
  if ('whizai' in source) return source.whizai?.embedding_space;
  if ('embedding_space' in source) return source.embedding_space;
  return undefined;
}

function checkKnown(space: string | undefined, label: string): string {
  if (typeof space !== 'string' || space.trim() === '') {
    throw new EmbeddingSpaceError(
      `Embedding space ${label} is missing; refusing to compare vectors of unknown origin.`,
      'EMBEDDING_SPACE_UNKNOWN'
    );
  }
  if (/unknown/i.test(space)) {
    throw new EmbeddingSpaceError(
      `Embedding space ${label} is not fully attributed (${space}); refusing to compare.`,
      'EMBEDDING_SPACE_UNKNOWN'
    );
  }
  return space;
}

/**
 * Throw unless `a` and `b` name the same, fully-known embedding space.
 * Returns the shared space string.
 */
export function assertSameEmbeddingSpace(a: EmbeddingSpaceSource, b: EmbeddingSpaceSource): string {
  const left = checkKnown(embeddingSpaceOf(a), 'A');
  const right = checkKnown(embeddingSpaceOf(b), 'B');
  if (left !== right) {
    throw new EmbeddingSpaceError(
      `Embedding spaces differ: '${left}' vs '${right}'. Vectors from different spaces are not comparable.`,
      'EMBEDDING_SPACE_MISMATCH'
    );
  }
  return left;
}
