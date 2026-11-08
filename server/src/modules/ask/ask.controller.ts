import type { OutgoingHttpHeaders } from 'node:http';
import { Body, Controller, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from '../../common/errors/error-codes';
import { mapError } from '../../common/errors/error-mapper';
import { pathOf } from '../../common/filters/all-exceptions.filter';
import { ApiCommonErrors, ApiErrorResponses } from '../../common/swagger/api-errors.decorator';
import { AskRequest } from './ask.dto';
import { AskService } from './ask.service';
import { LlmService } from './llm.service';

const STREAM_EXAMPLE = `event: sources
data: {"sources":[{"n":1,"id":"eur-020-001","text":"The 20 euro note is blue.","sourceName":"European Central Bank","sourceUrl":"https://www.ecb.europa.eu/"}]}

event: token
data: {"text":"The "}

event: token
data: {"text":"20 "}

event: token
data: {"text":"euro "}

event: token
data: {"text":"note "}

event: token
data: {"text":"is "}

event: token
data: {"text":"blue. "}

event: token
data: {"text":"[1] "}

event: done
data: {"finishReason":"stop","answered":true}
`;

export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

@ApiTags('Ask')
@ApiCommonErrors()
@Controller('ask')
export class AskController {
  private readonly logger = new Logger('Ask');

  constructor(
    private readonly ask: AskService,
    private readonly llm: LlmService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiConsumes('application/json')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    operationId: 'askQuestion',
    summary: 'Ask a question about a currency (streamed)',
    description:
      'Answers a question using only the facts in the catalogue, and streams the answer word by word as **server-sent events**, so the app can show it as it is written.\n\n' +
      '### The stream\n' +
      'The response is `text/event-stream`. Each message is `event: <name>` then `data: <json>`, ended by a blank line. Events arrive in this order:\n\n' +
      '| Event | Data | When |\n|---|---|---|\n' +
      '| `sources` | `{ sources: [{ n, id, text, sourceName, sourceUrl }] }` | First, once. The facts the answer is built from; `[n]` in the answer refers to `n`. Empty when nothing matched. |\n' +
      '| `token` | `{ text }` | Many times. Append `text` to the answer. |\n' +
      '| `done` | `{ finishReason, answered }` | Last, once. `answered` is false when the facts did not cover the question. |\n' +
      '| `error` | the standard error body | Instead of `done`, if something fails after the stream has started. |\n\n' +
      '### Errors\n' +
      '- **Before the stream starts** (bad request, unknown currency, rate limit) you get an ordinary JSON error with the matching HTTP status.\n' +
      '- **After it starts** the status is already 200, so a failure arrives as an `error` event and the stream ends.\n' +
      '- **Closing the connection** cancels the answer immediately.\n\n' +
      '### What answers it\n' +
      'No language model is connected yet. The answer is made by quoting the best matching facts with their `[n]` numbers, so it can never say anything that is not in the catalogue. ' +
      'If no fact matches, the answer is "I don\'t have that information yet." and `answered` is false. A model will replace this without changing the stream.\n\n' +
      '**Rate limit:** 10 requests per minute per address, on top of the general limit.',
  })
  @ApiOkResponse({
    description: 'A stream of events. See the table above.',
    content: {
      'text/event-stream': {
        schema: { type: 'string' },
        example: STREAM_EXAMPLE,
      },
    },
  })
  @ApiErrorResponses(
    '/v1/ask',
    {
      code: ErrorCode.VALIDATION_FAILED,
      path: '/v1/ask',
      message: 'Invalid question: question must be longer than or equal to 3 characters.',
      details: [{ field: 'question', problems: ['question must be longer than or equal to 3 characters'] }],
    },
    ErrorCode.CURRENCY_NOT_FOUND,
    ErrorCode.INVALID_JSON,
    ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    ErrorCode.PAYLOAD_TOO_LARGE,
  )
  async askQuestion(
    @Body() body: AskRequest,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Anything thrown here is still before the first byte, so the exception
    // filter can answer with normal JSON.
    const plan = await this.ask.plan(body);

    reply.hijack();
    const raw = reply.raw;
    // Keep headers already set on the reply, such as the rate-limit ones.
    const inherited = Object.fromEntries(
      Object.entries(reply.getHeaders()).filter(([, v]) => v !== undefined),
    ) as OutgoingHttpHeaders;
    raw.writeHead(200, {
      ...inherited,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
      'x-request-id': req.id,
    });

    const abort = new AbortController();
    raw.on('close', () => {
      if (!raw.writableEnded) abort.abort();
    });

    try {
      raw.write(sse('sources', { sources: plan.sources }));
      for await (const piece of this.llm.stream(plan, abort.signal)) {
        if (abort.signal.aborted) break;
        raw.write(sse('token', { text: piece }));
      }
      if (!abort.signal.aborted) {
        raw.write(
          sse('done', { finishReason: 'stop', answered: plan.sources.length > 0 }),
        );
      }
    } catch (error) {
      const mapped = mapError(error, { requestId: req.id, path: pathOf(req.url) });
      this.logger.error(`Stream failed [${req.id}]`, error instanceof Error ? error.stack : String(error));
      if (!abort.signal.aborted) raw.write(sse('error', mapped.body));
    } finally {
      raw.end();
    }
  }
}
