import { HttpException } from '@nestjs/common';
import { AppException } from './app.exception';
import { ApiError } from './api-error.dto';
import { ERROR_CATALOG, ErrorCode } from './error-codes';

export interface ErrorContext {
  requestId: string;
  /** Path only, no query string. */
  path: string;
  now?: Date;
}

export interface MappedError {
  body: ApiError;
  headers: Record<string, string>;
  /** How loudly to log it. Server faults are errors; caller mistakes are not. */
  log: 'error' | 'warn' | 'none';
  cause: unknown;
}

function body(
  code: ErrorCode,
  message: string,
  ctx: ErrorContext,
  extra: Partial<Pick<ApiError, 'hint' | 'details' | 'status'>> = {},
): ApiError {
  const info = ERROR_CATALOG[code];
  const result: ApiError = {
    status: extra.status ?? info.status,
    code,
    message,
    hint: extra.hint ?? info.hint,
    retryable: info.retryable,
    requestId: ctx.requestId,
    timestamp: (ctx.now ?? new Date()).toISOString(),
    path: ctx.path,
  };
  if (extra.details?.length) result.details = extra.details;
  return result;
}

function messageOf(response: unknown, fallback: string): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const m = (response as { message: unknown }).message;
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string') return m;
  }
  return fallback;
}

interface FastifyLikeError {
  code: string;
  statusCode?: number;
  message?: string;
}

function isFastifyError(e: unknown): e is FastifyLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    (e as { code: string }).code.startsWith('FST_')
  );
}

/**
 * Turns anything that can be thrown into the one error body the API returns.
 * Pure on purpose: the same function serves the exception filter and the
 * web-server-level handler, and is tested without a server.
 */
export function mapError(exception: unknown, ctx: ErrorContext): MappedError {
  // 1. Errors our own code raised on purpose.
  if (exception instanceof AppException) {
    const status = exception.getStatus();
    return {
      body: body(exception.code, messageOf(exception.getResponse(), 'Request failed.'), ctx, {
        hint: exception.hint,
        details: exception.details,
        status,
      }),
      headers: exception.headers ?? {},
      log: status >= 500 ? 'error' : 'none',
      cause: exception,
    };
  }

  // 2. Errors raised by the web server before any of our code runs.
  if (isFastifyError(exception)) {
    const status = exception.statusCode ?? 500;
    switch (exception.code) {
      case 'FST_ERR_CTP_INVALID_JSON_BODY':
        return client(ErrorCode.INVALID_JSON, 'The request body is not valid JSON.', ctx, exception);
      case 'FST_ERR_CTP_EMPTY_JSON_BODY':
        return client(ErrorCode.INVALID_JSON, 'The request body is empty. Send a JSON object.', ctx, exception);
      case 'FST_ERR_CTP_BODY_TOO_LARGE':
        return client(ErrorCode.PAYLOAD_TOO_LARGE, 'The request body is larger than 32 KB.', ctx, exception);
      case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
        return client(
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          'Content-Type must be application/json.',
          ctx,
          exception,
        );
      default:
        if (status < 500) {
          return client(ErrorCode.BAD_REQUEST, exception.message ?? 'Bad request.', ctx, exception, status);
        }
    }
  }

  // 3. Framework exceptions (not found, throttled, pipes, guards).
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const message = messageOf(exception.getResponse(), exception.message);
    if (status === 429) {
      return client(ErrorCode.RATE_LIMITED, 'Too many requests. Slow down.', ctx, exception);
    }
    if (status === 404 && /^Cannot [A-Z]+ /.test(message)) {
      return client(ErrorCode.ROUTE_NOT_FOUND, `There is no endpoint at ${ctx.path}.`, ctx, exception);
    }
    // NestJS wraps JSON parse failures in a plain 400 with these messages.
    if (status === 400 && /not valid JSON/i.test(message)) {
      return client(ErrorCode.INVALID_JSON, 'The request body is not valid JSON.', ctx, exception);
    }
    if (status === 400 && /cannot be empty/i.test(message)) {
      return client(ErrorCode.INVALID_JSON, 'The request body is empty. Send a JSON object.', ctx, exception);
    }
    if (status === 413) return client(ErrorCode.PAYLOAD_TOO_LARGE, 'The request body is larger than 32 KB.', ctx, exception);
    if (status === 415) return client(ErrorCode.UNSUPPORTED_MEDIA_TYPE, message, ctx, exception);
    if (status === 503) {
      return {
        body: body(ErrorCode.SERVICE_UNAVAILABLE, message, ctx),
        headers: {},
        log: 'warn',
        cause: exception,
      };
    }
    if (status < 500) {
      return client(ErrorCode.BAD_REQUEST, message, ctx, exception, status);
    }
  }

  // 4. Anything else is a bug. The caller gets no internal detail.
  return {
    body: body(ErrorCode.INTERNAL_ERROR, 'Something went wrong on the server.', ctx),
    headers: {},
    log: 'error',
    cause: exception,
  };
}

function client(
  code: ErrorCode,
  message: string,
  ctx: ErrorContext,
  cause: unknown,
  status?: number,
): MappedError {
  return { body: body(code, message, ctx, { status }), headers: {}, log: 'none', cause };
}
