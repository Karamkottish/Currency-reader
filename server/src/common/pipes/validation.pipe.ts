import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException, ErrorDetail } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** Flattens class-validator's nested errors into `{ field, problems }` rows. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ErrorDetail[] {
  const rows: ErrorDetail[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      rows.push({ field, problems: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      rows.push(...flattenValidationErrors(error.children, field));
    }
  }
  return rows;
}

/**
 * Checks every request body, query string and path parameter against its DTO.
 *
 * - unknown fields are rejected, not silently dropped, so a typo in a client
 *   shows up in development instead of being ignored in production
 * - values are converted to the declared type (query strings arrive as text)
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => {
      const details = flattenValidationErrors(errors);
      const first = details[0];
      return new AppException(
        ErrorCode.VALIDATION_FAILED,
        details.length === 1 && first
          ? `Invalid ${first.field}: ${first.problems[0]}.`
          : `${details.length} fields are invalid.`,
        { details },
      );
    },
  });
}
