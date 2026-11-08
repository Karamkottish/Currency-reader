import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiError, ApiErrorDetail } from '../errors/api-error.dto';
import { ERROR_CATALOG, ErrorCode } from '../errors/error-codes';

export interface ErrorExample {
  code: ErrorCode;
  /** Request path shown in the example. */
  path: string;
  message?: string;
  details?: ApiErrorDetail[];
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_FAILED]: 'Invalid lines: lines must contain at least 1 elements.',
  [ErrorCode.INVALID_JSON]: 'The request body is not valid JSON.',
  [ErrorCode.BAD_REQUEST]: 'The request was rejected.',
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 'Content-Type must be application/json.',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'The request body is larger than 32 KB.',
  [ErrorCode.ROUTE_NOT_FOUND]: 'There is no endpoint at /v1/currency.',
  [ErrorCode.CURRENCY_NOT_FOUND]: "No currency with the code 'XYZ'.",
  [ErrorCode.DENOMINATION_NOT_FOUND]: 'EUR has no 25 denomination.',
  [ErrorCode.APP_UPDATE_REQUIRED]: 'App version 0.0.9 is older than the minimum 0.1.0.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Slow down.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The catalogue is not ready.',
  [ErrorCode.INTERNAL_ERROR]: 'Something went wrong on the server.',
};

/** A realistic error body for the docs. Fixed values keep the spec stable. */
export function errorExample(e: ErrorExample) {
  const info = ERROR_CATALOG[e.code];
  return {
    status: info.status,
    code: e.code,
    message: e.message ?? DEFAULT_MESSAGES[e.code],
    hint: info.hint,
    retryable: info.retryable,
    ...(e.details ? { details: e.details } : {}),
    requestId: '8f14e45f-ceea-467a-9575-1c9d0b1f0a11',
    timestamp: '2026-11-08T10:15:30.000Z',
    path: e.path,
  };
}

type Input = ErrorCode | ErrorExample;

/**
 * Documents the error responses of an endpoint (or of a whole controller),
 * one entry per HTTP status, each with an example body for every code that
 * can come back with that status.
 */
export function ApiErrorResponses(path: string, ...inputs: Input[]) {
  const examples = inputs.map((i) => (typeof i === 'string' ? { code: i, path } : i));

  const byStatus = new Map<number, ErrorExample[]>();
  for (const example of examples) {
    const status = ERROR_CATALOG[example.code].status;
    byStatus.set(status, [...(byStatus.get(status) ?? []), example]);
  }

  const responses = [...byStatus.entries()]
    .sort(([a], [b]) => a - b)
    .map(([status, list]) =>
      ApiResponse({
        status,
        description: list
          .map((e) => `**${e.code}**: ${ERROR_CATALOG[e.code].summary}`)
          .join('\n\n'),
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ApiError) },
            examples: Object.fromEntries(
              list.map((e) => [e.code, { summary: e.code, value: errorExample(e) }]),
            ),
          },
        },
      }),
    );

  return applyDecorators(ApiExtraModels(ApiError, ApiErrorDetail), ...responses);
}

/** 429 and 500 can happen on any endpoint, so every controller gets them. */
export function ApiCommonErrors() {
  return ApiErrorResponses('/v1/currencies', ErrorCode.RATE_LIMITED, ErrorCode.INTERNAL_ERROR);
}
