import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, ErrorCode } from './error-codes';

/** One field-level problem inside a VALIDATION_FAILED error. */
export interface ErrorDetail {
  field: string;
  problems: string[];
}

export interface AppExceptionOptions {
  /** Overrides the default hint for this code. */
  hint?: string;
  details?: ErrorDetail[];
  /** Extra response headers (for example Retry-After). */
  headers?: Record<string, string>;
}

/**
 * The exception services throw for any failure the caller can understand.
 * The exception filter turns it into the standard error body.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly details?: ErrorDetail[];
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    options: AppExceptionOptions = {},
  ) {
    super({ code, message }, ERROR_CATALOG[code].status);
    this.code = code;
    this.hint = options.hint;
    this.details = options.details;
    this.headers = options.headers;
  }
}
