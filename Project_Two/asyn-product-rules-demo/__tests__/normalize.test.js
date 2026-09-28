import { describe, expect, it } from 'vitest';

import { normalizeNcm, normalizeText } from '../src/normalize.js';

describe('normalizeText', () => {
  it('lowercases', () => {
    expect(normalizeText('CERVEJA')).toBe('cerveja');
  });

  it('strips accents', () => {
    expect(normalizeText('Refrigeração')).toBe('refrigeracao');
    expect(normalizeText('cerveja pilsen')).toBe('cerveja pilsen');
  });

  it('handles null/undefined without throwing', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(null)).toBe('');
  });
});

describe('normalizeNcm', () => {
  it('strips punctuation, keeping only digits', () => {
    expect(normalizeNcm('2203.00.00')).toBe('22030000');
    expect(normalizeNcm('2203 00 00')).toBe('22030000');
    expect(normalizeNcm('2203')).toBe('2203');
  });

  it('handles null/undefined without throwing', () => {
    expect(normalizeNcm(undefined)).toBe('');
    expect(normalizeNcm(null)).toBe('');
  });
});
