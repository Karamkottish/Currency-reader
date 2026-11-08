import { CurrencyRecord, FactRecord } from './catalog.types';

/**
 * Starter catalogue: four currencies, written by hand from public central
 * bank pages. It exists so every endpoint works end to end before the
 * database and the update pipeline do. Every fact is marked `unverified`.
 *
 * The keyword lists are matching hints for OCR text, not facts.
 */

/** Identifies the data set. Changes whenever the seed does. */
export const DATA_PACK_VERSION = '2026.11.08-1';
export const DATA_PACK_PUBLISHED_AT = '2026-11-08T00:00:00.000Z';

const ECB = { name: 'European Central Bank', url: 'https://www.ecb.europa.eu/' };
const FED = { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/' };
const BOE = { name: 'Bank of England', url: 'https://www.bankofengland.co.uk/' };
const BOJ = { name: 'Bank of Japan', url: 'https://www.boj.or.jp/en/' };

export const SEED_CURRENCIES: CurrencyRecord[] = [
  {
    isoCode: 'EUR',
    name: 'Euro',
    country: 'Euro area',
    symbol: '€',
    issuer: 'European Central Bank',
    factsVersion: 1,
    keywords: [
      { phrase: 'EUROPEAN CENTRAL BANK', kind: 'issuer' },
      { phrase: 'EUROPAISCHE ZENTRALBANK', kind: 'issuer' },
      { phrase: 'BANQUE CENTRALE EUROPEENNE', kind: 'issuer' },
      { phrase: 'BCE', kind: 'issuer' },
      { phrase: 'ECB', kind: 'issuer' },
      { phrase: 'EZB', kind: 'issuer' },
      { phrase: 'EURO', kind: 'currency' },
      { phrase: 'EUR', kind: 'code' },
    ],
    denominations: [
      { value: 5, kind: 'note', words: ['FIVE'] },
      { value: 10, kind: 'note', words: ['TEN'] },
      { value: 20, kind: 'note', words: ['TWENTY'] },
      { value: 50, kind: 'note', words: ['FIFTY'] },
      { value: 100, kind: 'note', words: ['ONE HUNDRED', 'HUNDRED'] },
      { value: 200, kind: 'note', words: ['TWO HUNDRED'] },
      { value: 500, kind: 'note', words: ['FIVE HUNDRED'] },
    ],
  },
  {
    isoCode: 'USD',
    name: 'United States dollar',
    country: 'United States',
    symbol: '$',
    issuer: 'Federal Reserve',
    factsVersion: 1,
    keywords: [
      { phrase: 'FEDERAL RESERVE NOTE', kind: 'issuer' },
      { phrase: 'FEDERAL RESERVE', kind: 'issuer' },
      { phrase: 'UNITED STATES OF AMERICA', kind: 'country' },
      { phrase: 'DOLLARS', kind: 'currency' },
      { phrase: 'DOLLAR', kind: 'currency' },
      { phrase: 'USD', kind: 'code' },
    ],
    denominations: [
      { value: 1, kind: 'note', words: ['ONE'] },
      { value: 2, kind: 'note', words: ['TWO'] },
      { value: 5, kind: 'note', words: ['FIVE'] },
      { value: 10, kind: 'note', words: ['TEN'] },
      { value: 20, kind: 'note', words: ['TWENTY'] },
      { value: 50, kind: 'note', words: ['FIFTY'] },
      { value: 100, kind: 'note', words: ['ONE HUNDRED'] },
    ],
  },
  {
    isoCode: 'GBP',
    name: 'Pound sterling',
    country: 'United Kingdom',
    symbol: '£',
    issuer: 'Bank of England',
    factsVersion: 1,
    keywords: [
      { phrase: 'BANK OF ENGLAND', kind: 'issuer' },
      { phrase: 'POUNDS', kind: 'currency' },
      { phrase: 'POUND', kind: 'currency' },
      { phrase: 'STERLING', kind: 'currency' },
      { phrase: 'GBP', kind: 'code' },
    ],
    denominations: [
      { value: 5, kind: 'note', words: ['FIVE'] },
      { value: 10, kind: 'note', words: ['TEN'] },
      { value: 20, kind: 'note', words: ['TWENTY'] },
      { value: 50, kind: 'note', words: ['FIFTY'] },
    ],
  },
  {
    isoCode: 'JPY',
    name: 'Japanese yen',
    country: 'Japan',
    symbol: '¥',
    issuer: 'Bank of Japan',
    factsVersion: 1,
    keywords: [
      { phrase: 'BANK OF JAPAN', kind: 'issuer' },
      { phrase: 'NIPPON GINKO', kind: 'issuer' },
      { phrase: 'YEN', kind: 'currency' },
      { phrase: 'JPY', kind: 'code' },
    ],
    denominations: [
      { value: 1000, kind: 'note', words: ['ONE THOUSAND', 'THOUSAND'] },
      { value: 5000, kind: 'note', words: ['FIVE THOUSAND'] },
      { value: 10000, kind: 'note', words: ['TEN THOUSAND'] },
    ],
  },
];

export const SEED_FACTS: FactRecord[] = [
  {
    id: 'eur-001',
    isoCode: 'EUR',
    text: 'Euro banknotes come in seven values: 5, 10, 20, 50, 100, 200 and 500 euro.',
    source: ECB,
    verification: 'unverified',
  },
  {
    id: 'eur-002',
    isoCode: 'EUR',
    text: 'The European Central Bank has the exclusive right to authorise the issue of euro banknotes.',
    source: ECB,
    verification: 'unverified',
  },
  {
    id: 'eur-020-001',
    isoCode: 'EUR',
    denomination: 20,
    text: 'The 20 euro note is blue.',
    source: ECB,
    verification: 'unverified',
  },
  {
    id: 'eur-020-002',
    isoCode: 'EUR',
    denomination: 20,
    text: 'The 20 euro note of the Europa series was introduced on 25 November 2015.',
    source: ECB,
    verification: 'unverified',
  },
  {
    id: 'usd-001',
    isoCode: 'USD',
    text: 'United States banknotes are Federal Reserve Notes, issued by the Federal Reserve.',
    source: FED,
    verification: 'unverified',
  },
  {
    id: 'usd-002',
    isoCode: 'USD',
    text: 'Banknotes in circulation have the values 1, 2, 5, 10, 20, 50 and 100 dollars.',
    source: FED,
    verification: 'unverified',
  },
  {
    id: 'gbp-001',
    isoCode: 'GBP',
    text: 'The Bank of England issues banknotes in England and Wales.',
    source: BOE,
    verification: 'unverified',
  },
  {
    id: 'gbp-002',
    isoCode: 'GBP',
    text: 'Bank of England 5, 10, 20 and 50 pound notes are printed on polymer.',
    source: BOE,
    verification: 'unverified',
  },
  {
    id: 'gbp-020-001',
    isoCode: 'GBP',
    denomination: 20,
    text: 'The polymer 20 pound note was first issued on 20 February 2020.',
    source: BOE,
    verification: 'unverified',
  },
  {
    id: 'jpy-001',
    isoCode: 'JPY',
    text: 'The yen is the currency of Japan, and its banknotes are issued by the Bank of Japan.',
    source: BOJ,
    verification: 'unverified',
  },
  {
    id: 'jpy-002',
    isoCode: 'JPY',
    text: 'Japan began issuing redesigned 1,000, 5,000 and 10,000 yen banknotes on 3 July 2024.',
    source: BOJ,
    verification: 'unverified',
  },
];
