import type { Snippet } from "./contracts";

/** How one matching line reads in a result row. Pure, so the tests read the same rules. */

const unescape = (text: string) => text.replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");

/**
 * Codex logs shell output as an escaped JSON envelope (`{"output":"…","metadata":{…}}`) and the
 * server's window cuts it anywhere; show only the output it carries.
 */
export function toolEnvelope(before: string, match: string, after: string): { before: string; match: string; after: string } {
  const opens = /\{"output":"/.test(before) || /","metadata":/.test(after);
  if (!opens) return { before, match, after };
  const head = before.replace(/^(…)?.*?\{"output":"/, "$1");
  const tail = after.replace(/",\s*"metadata":.*$/s, "").replace(/"\}\s*$/, "");
  return { before: unescape(head), match: unescape(match), after: unescape(tail) };
}

/** Keeps the match near the start of a two-line row: the server leaves up to 120 characters before it. */
export const LEAD_CHARS = 56;
export function snippetText(snippet: Snippet): { value: string; fallback: { start: number; end: number } | null } {
  const parts = snippet.role === "tool" ? toolEnvelope(snippet.before, snippet.match, snippet.after) : snippet;
  let before = parts.before;
  if (snippet.match && before.length > LEAD_CHARS) {
    const cut = before.slice(before.length - LEAD_CHARS);
    const space = cut.indexOf(" ");
    before = `…${(space > 0 && space < 20 ? cut.slice(space + 1) : cut).trimStart()}`;
  }
  const value = `${before}${parts.match}${parts.after}`;
  return { value, fallback: parts.match ? { start: before.length, end: before.length + parts.match.length } : null };
}

