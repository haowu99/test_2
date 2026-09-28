/**
 * Normalization helpers for product-rule matching.
 *
 * Kept separate from the matcher itself so each normalization rule can
 * be tested and reasoned about independently.
 */

/**
 * Lowercases and strips accents/diacritics, e.g. "Cerveja" and
 * "cerveja" and "CERVEJA" all normalize to "cerveja"; "Refrigerante"
 * with any accented character normalizes the same way.
 *
 * Implementation note: Unicode NFD decomposition splits accented
 * letters into a base letter + a combining mark (e.g. "é" -> "e" +
 * U+0301). Stripping all Unicode combining marks after that leaves
 * just the base letters.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Strips everything except digits from an NCM code, so "2203.00.00",
 * "2203 00 00", and "2203" all compare equal on their shared prefix.
 *
 * Assumption (flagged in NOTES.md): the task's example rule value is
 * plain digits ("2203"), but doesn't say whether the *product's* NCM
 * on file is stored with punctuation. Normalizing both sides to
 * digits-only before comparing is the safer default - confirm this
 * against how NCM is actually stored on the invoice item once that
 * field is confirmed.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeNcm(value) {
  return String(value ?? '').replace(/\D/g, '');
}
