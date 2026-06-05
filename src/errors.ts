/**
 * Typed error hierarchy for the Whizurai SDK.
 *
 * Every HTTP failure is normalized into a {@link WhizuraiError} (or a subclass)
 * so callers can branch on `error.status` / `instanceof` instead of parsing
 * axios internals.
 */

export class WhizuraiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WhizuraiError';
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends WhizuraiError {
  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message, code, status, details);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends WhizuraiError {
  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message, code, status, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends WhizuraiError {
  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message, code, status, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends WhizuraiError {
  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message, code, status, details);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends WhizuraiError {
  constructor(message: string, code = 'TIMEOUT') {
    super(message, code);
    this.name = 'TimeoutError';
  }
}

/** Construct the most specific error subclass for an HTTP status. */
export function errorForStatus(
  status: number | undefined,
  message: string,
  code: string,
  details?: unknown
): WhizuraiError {
  switch (status) {
    case 401:
    case 403:
      return new AuthenticationError(message, code, status, details);
    case 404:
      return new NotFoundError(message, code, status, details);
    case 400:
    case 422:
      return new ValidationError(message, code, status, details);
    case 429:
      return new RateLimitError(message, code, status, details);
    default:
      return new WhizuraiError(message, code, status, details);
  }
}
