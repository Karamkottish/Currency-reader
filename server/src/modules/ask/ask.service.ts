import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { CatalogRepository } from '../catalog/catalog.repository';
import { FactRecord } from '../catalog/catalog.types';
import { AskRequest, AskSource } from './ask.dto';

export const NO_ANSWER = "I don't have that information yet.";

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'at', 'to', 'it', 'its',
  'this', 'that', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'does', 'do', 'did',
  'and', 'or', 'for', 'with', 'about', 'me', 'tell', 'note', 'notes', 'banknote', 'banknotes',
]);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

export interface RetrievedFact {
  fact: FactRecord;
  score: number;
}

/**
 * Finds the facts that share the most words with the question. A number in
 * the question that equals a fact's denomination counts double, so "the 20
 * note" prefers facts about the 20.
 */
export function retrieveFacts(
  facts: FactRecord[],
  question: string,
  limit = 3,
): RetrievedFact[] {
  const asked = [...new Set(tokens(question))];
  return facts
    .map((fact) => {
      const have = new Set(tokens(fact.text));
      let score = 0;
      for (const word of asked) {
        if (have.has(word)) score += 1;
        if (fact.denomination !== undefined && word === String(fact.denomination)) score += 2;
      }
      return { fact, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface AnswerPlan {
  /** What the model may use. Empty means there is nothing to answer from. */
  sources: AskSource[];
  /** The prompt a language model would receive. */
  prompt: string;
}

/** The instruction every model call starts with. Kept identical for caching. */
export const SYSTEM_PROMPT =
  'You are a currency facts assistant. Answer ONLY from FACTS. ' +
  `If the answer is not in FACTS, say "${NO_ANSWER}"`;

@Injectable()
export class AskService {
  constructor(
    private readonly catalog: CatalogRepository,
    @Inject(APP_CONFIG) readonly config: AppConfig,
  ) {}

  /**
   * Looks up the facts for a question. Throws before anything is streamed if
   * the request names a currency that does not exist, so the caller still
   * gets a normal JSON error.
   */
  async plan(request: AskRequest): Promise<AnswerPlan> {
    if (request.isoCode && !(await this.catalog.find(request.isoCode))) {
      throw new AppException(
        ErrorCode.CURRENCY_NOT_FOUND,
        `No currency with the code '${request.isoCode}'.`,
      );
    }
    const facts = await this.catalog.allFacts(request.isoCode);
    const sources: AskSource[] = retrieveFacts(facts, request.question).map((r, i) => ({
      n: i + 1,
      id: r.fact.id,
      text: r.fact.text,
      sourceName: r.fact.source.name,
      sourceUrl: r.fact.source.url,
    }));
    const prompt = [
      SYSTEM_PROMPT,
      'FACTS:',
      ...sources.map((s) => `[${s.n}] ${s.text}`),
      `User: ${request.question}`,
    ].join('\n');
    return { sources, prompt };
  }
}
