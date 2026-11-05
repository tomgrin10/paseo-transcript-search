/**
 * Where the search text sits inside a line of text, for marking every occurrence (the server marks
 * only the first). Mirrors the engines: a literal or regular expression in grep mode, and in
 * ranked mode each word, the last one also as a prefix, ignoring case. Pure, shared by the screen,
 * the preview and the chat rows.
 */

export interface HighlightQuery {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  ranked: boolean;
}

export interface Range { start: number; end: number }
export type Segment = { text: string; mark: boolean };

const MAX_RANGES = 60;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unicode-aware when the engine allows it; built at runtime so an older engine never fails to load. */
function wordChars(): { split: RegExp; test: RegExp; unicode: boolean } {
  try {
    return { split: new RegExp("[^\\p{L}\\p{N}]+", "u"), test: new RegExp("[\\p{L}\\p{N}]", "u"), unicode: true };
  } catch {
    return { split: /[^A-Za-z0-9\u00C0-\uFFFF]+/, test: /[A-Za-z0-9\u00C0-\uFFFF]/, unicode: false };
  }
}

/**
 * The words ranked search matches on, as FTS5 tokenises them (letters and digits). Each word is
 * marked with whatever letters follow it, close to the index's stemming and last-word prefix.
 */
function rankedPattern(query: string): RegExp | null {
  const chars = wordChars();
  const words = query.split(/\s+/).map((word) => word.replace(/["*]/g, "")).filter((word) => chars.test.test(word));
  if (words.length === 0) return null;
  const letter = chars.unicode ? "[\\p{L}\\p{N}]" : "[A-Za-z0-9\\u00C0-\\uFFFF]";
  const parts = words.map((word) => `${word.split(chars.split).filter(Boolean).map(escapeRegExp).join(`(?:(?!${letter}).)+`)}${letter}*`);
  try {
    return new RegExp(`(?<!${letter})(?:${parts.join("|")})`, chars.unicode ? "giu" : "gi");
  } catch {
    // An engine without lookbehind still marks the words themselves.
    return new RegExp(words.map(escapeRegExp).join("|"), "gi");
  }
}

export function buildPattern(q: HighlightQuery): RegExp | null {
  const query = q.query;
  if (query.trim().length === 0) return null;
  if (q.ranked && !q.regex) return rankedPattern(query);
  try {
    return new RegExp(q.regex ? query : escapeRegExp(query), q.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

export function highlightRanges(text: string, q: HighlightQuery, pattern = buildPattern(q)): Range[] {
  if (!pattern || !text) return [];
  const ranges: Range[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match && ranges.length < MAX_RANGES; match = pattern.exec(text)) {
    if (match[0].length === 0) { pattern.lastIndex += 1; continue; }
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

/** Splits text into plain and marked runs. `fallback` marks a known span when the pattern finds none. */
export function segments(text: string, q: HighlightQuery, fallback?: Range | null, pattern?: RegExp | null): Segment[] {
  let ranges = highlightRanges(text, q, pattern === undefined ? buildPattern(q) : pattern);
  if (ranges.length === 0 && fallback && fallback.end > fallback.start) ranges = [fallback];
  if (ranges.length === 0) return [{ text, mark: false }];
  const out: Segment[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start > at) out.push({ text: text.slice(at, range.start), mark: false });
    out.push({ text: text.slice(range.start, range.end), mark: true });
    at = range.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}
