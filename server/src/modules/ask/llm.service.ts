import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AskSource } from './ask.dto';
import { NO_ANSWER } from './ask.service';

export interface LlmRequest {
  prompt: string;
  sources: AskSource[];
}

/**
 * The only thing the rest of the server knows about a language model.
 * Today's implementation needs no model; `llama-server` replaces it behind
 * the same interface.
 */
export abstract class LlmService {
  /** Yields the answer a piece at a time. Stops promptly when aborted. */
  abstract stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<string>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * "Answers" by quoting the best matching facts with their numbers. It cannot
 * invent anything, which makes it a safe stand-in until a model is connected:
 * every sentence it returns is one of the sourced facts.
 */
@Injectable()
export class ExtractiveLlmService extends LlmService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async *stream({ sources }: LlmRequest, signal: AbortSignal): AsyncIterable<string> {
    const answer =
      sources.length === 0
        ? NO_ANSWER
        : sources
            .slice(0, 2)
            .map((s) => `${s.text} [${s.n}]`)
            .join(' ');

    for (const word of answer.split(' ')) {
      if (signal.aborted) return;
      yield `${word} `;
      await sleep(this.config.askTokenDelayMs, signal);
    }
  }
}
