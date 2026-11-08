import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { mapError } from '../errors/error-mapper';

const logger = new Logger('Errors');

export function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Sends the standard error body for any exception. Used by the Nest filter
 * below and by the web-server-level handler in app.setup.ts, so a malformed
 * body and a thrown exception look the same to the caller.
 */
export function sendError(
  exception: unknown,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  const path = pathOf(req.url);
  const mapped = mapError(exception, { requestId: req.id, path });

  if (mapped.log === 'error') {
    const detail =
      mapped.cause instanceof Error ? (mapped.cause.stack ?? mapped.cause.message) : String(mapped.cause);
    logger.error(`${req.method} ${path} -> ${mapped.body.status} ${mapped.body.code} [${req.id}]`, detail);
  } else if (mapped.log === 'warn') {
    logger.warn(`${req.method} ${path} -> ${mapped.body.status} ${mapped.body.code} [${req.id}]`);
  }

  // A stream (/v1/ask) has already sent its headers. It reports errors as an
  // `error` event instead, so all that is left is to close the connection.
  if (reply.raw.headersSent) {
    if (!reply.raw.writableEnded) reply.raw.end();
    return;
  }

  for (const [name, value] of Object.entries(mapped.headers)) reply.header(name, value);
  reply
    .status(mapped.body.status)
    .header('content-type', 'application/json; charset=utf-8')
    .header('cache-control', 'no-store')
    .header('x-request-id', req.id)
    .send(mapped.body);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendError(exception, http.getRequest<FastifyRequest>(), http.getResponse<FastifyReply>());
  }
}
