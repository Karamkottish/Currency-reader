/**
 * Every error the API can return carries one of these codes. Clients should
 * branch on `code`, never on the message text, which may change.
 */
export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_JSON = 'INVALID_JSON',
  BAD_REQUEST = 'BAD_REQUEST',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  CURRENCY_NOT_FOUND = 'CURRENCY_NOT_FOUND',
  DENOMINATION_NOT_FOUND = 'DENOMINATION_NOT_FOUND',
  APP_UPDATE_REQUIRED = 'APP_UPDATE_REQUIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorInfo {
  /** HTTP status the code is returned with. */
  status: number;
  /** One line for the docs table. */
  summary: string;
  /** What the caller should do next. Sent in the `hint` field. */
  hint: string;
  /** True if the same request may succeed later without changes. */
  retryable: boolean;
}

export const ERROR_CATALOG: Record<ErrorCode, ErrorInfo> = {
  [ErrorCode.VALIDATION_FAILED]: {
    status: 400,
    summary: 'One or more fields are missing, the wrong type, or out of range. `details` lists each one.',
    hint: 'Fix the fields listed in `details` and send the request again.',
    retryable: false,
  },
  [ErrorCode.INVALID_JSON]: {
    status: 400,
    summary: 'The request body is empty or is not valid JSON.',
    hint: 'Send a JSON object with the header Content-Type: application/json.',
    retryable: false,
  },
  [ErrorCode.BAD_REQUEST]: {
    status: 400,
    summary: 'The request was rejected for a reason that has no more specific code.',
    hint: 'Check the request against this documentation.',
    retryable: false,
  },
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: {
    status: 415,
    summary: 'The Content-Type is not application/json.',
    hint: 'Send the body as JSON with the header Content-Type: application/json.',
    retryable: false,
  },
  [ErrorCode.PAYLOAD_TOO_LARGE]: {
    status: 413,
    summary: 'The request body is larger than 32 KB.',
    hint: 'Send less data. Text only; never send images to this API.',
    retryable: false,
  },
  [ErrorCode.ROUTE_NOT_FOUND]: {
    status: 404,
    summary: 'There is no endpoint at that path or method.',
    hint: 'Check the path against this documentation. Paths start with /v1.',
    retryable: false,
  },
  [ErrorCode.CURRENCY_NOT_FOUND]: {
    status: 404,
    summary: 'No currency with that ISO 4217 code is in the catalogue.',
    hint: 'List the supported codes with GET /v1/currencies. For a note the app has scanned, POST /v1/scan/resolve.',
    retryable: false,
  },
  [ErrorCode.DENOMINATION_NOT_FOUND]: {
    status: 404,
    summary: 'The currency exists but has no such denomination.',
    hint: 'Read the currency with GET /v1/currencies/{isoCode} to see its denominations.',
    retryable: false,
  },
  [ErrorCode.APP_UPDATE_REQUIRED]: {
    status: 426,
    summary: 'The app is older than the minimum version this server supports.',
    hint: 'Ask the user to update the app.',
    retryable: false,
  },
  [ErrorCode.RATE_LIMITED]: {
    status: 429,
    summary: 'Too many requests from this address. See the Retry-After header.',
    hint: 'Wait the number of seconds in the Retry-After header, then try again.',
    retryable: true,
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    status: 503,
    summary: 'The server is running but a part it needs is not ready.',
    hint: 'Try again in a few seconds.',
    retryable: true,
  },
  [ErrorCode.INTERNAL_ERROR]: {
    status: 500,
    summary: 'Something went wrong on the server. It is not caused by your request.',
    hint: 'Try again. If it keeps happening, report the requestId.',
    retryable: true,
  },
};
