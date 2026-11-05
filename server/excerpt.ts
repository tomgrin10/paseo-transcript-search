import { createReadStream } from "node:fs";
import { basename } from "node:path";
import type { Excerpt, ExcerptMessage } from "../shared/contracts";
import { loadAgentRecords } from "./census";
import { PARSE_CAP, buildLocator, classifyLine, collapseWhitespace } from "./snippets";
import { resolveTranscripts } from "./transcripts";

/**
 * Reads a few readable messages around one transcript line, for the match preview, the composer
 * attachment and the agent read tool. Transcripts are JSONL files that can run to hundreds of
 * megabytes with single lines of several megabytes, so the file is streamed, a line longer than
 * the parse cap is skipped without being held, and reading stops as soon as the messages after the
 * line are in. Only text a person or agent saw is returned: never paths or record fields.
 */

const TARGET_CHARS = 2400;
const CONTEXT_CHARS = 700;
const TOOL_CHARS = 280;
/** Stop reading a pathological file rather than hold the daemon. */
const BYTE_BUDGET = 512 * 1024 * 1024;
const TIME_BUDGET_MS = 8_000;

export interface ReadOptions {
  lineNumber?: number;
  radius: number;
  query?: string;
  regex?: boolean;
  caseSensitive?: boolean;
  signal?: AbortSignal;
}

export type FileExcerpt = Omit<Excerpt, "file">;

interface Raw { line: number; role: ExcerptMessage["role"]; text: string; timestamp?: string; tool?: string }

/** Codex wraps shell output as a JSON string (`{"output":"…","metadata":…}`); show the output. */
function unwrapToolOutput(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{\"output\"")) return text;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (value && typeof value === "object" && typeof (value as { output?: unknown }).output === "string") return (value as { output: string }).output;
  } catch { /* not JSON after all */ }
  return text;
}

/** Claude tool calls read `Name {json}`; Codex calls read `name {json}`. */
function splitToolName(text: string): { tool?: string; text: string } {
  const match = /^([A-Za-z][\w.:-]{0,60}) ([[{].*)$/s.exec(text);
  return match ? { tool: match[1], text: match[2] ?? "" } : { text };
}

const INPUT_FIELDS = ["command", "cmd", "file_path", "path", "pattern", "query", "url", "description", "prompt"];

/** A tool call's input as the one field a person would read: the command, the file, the pattern. */
export function summarizeToolInput(json: string): string {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return json; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return json;
  const record = value as Record<string, unknown>;
  for (const key of INPUT_FIELDS) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) return field.trim();
    if (Array.isArray(field) && field.every((part) => typeof part === "string")) {
      const parts = field as string[];
      // Codex runs `bash -lc "<script>"`: the script is the command.
      return (parts.length === 3 && /(^|\/)(ba|z)?sh$/.test(parts[0] ?? "") && parts[1] === "-lc" ? parts[2] ?? "" : parts.join(" ")).trim();
    }
  }
  return json;
}

function toRaw(line: number, rawLine: string, provider: string): Raw | null {
  const extracted = classifyLine(rawLine, provider);
  if (!extracted || extracted.role === "other") return null;
  let text = extracted.text.trim();
  if (!text) return null;
  let tool: string | undefined;
  if (extracted.role === "tool") {
    const split = splitToolName(text);
    tool = split.tool;
    text = (tool ? summarizeToolInput(split.text) : unwrapToolOutput(split.text)).trim();
    if (!text) return null;
  }
  return { line, role: extracted.role, text, ...(extracted.timestamp ? { timestamp: extracted.timestamp } : {}), ...(tool ? { tool } : {}) };
}

/** Shortens a message; a matched one keeps the stretch around the search text. */
export function clip(text: string, limit: number, locate?: ((text: string) => { index: number; length: number } | null) | null): { text: string; clipped: boolean } {
  if (text.length <= limit) return { text, clipped: false };
  const hit = locate?.(text) ?? null;
  if (!hit || hit.index + hit.length <= limit - 40) return { text: `${text.slice(0, limit).trimEnd()}…`, clipped: true };
  const start = Math.max(0, Math.min(hit.index - Math.floor(limit / 2), text.length - limit));
  const end = Math.min(text.length, start + limit);
  return { text: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`, clipped: true };
}

function finish(raw: Raw, limit: number, locate?: Parameters<typeof clip>[2]): ExcerptMessage {
  const role = raw.role;
  const body = role === "tool" ? collapseWhitespace(raw.text) : raw.text.replace(/\n{3,}/g, "\n\n");
  const shortened = clip(body, role === "tool" ? Math.min(limit, TOOL_CHARS) : limit, locate);
  return {
    line: raw.line,
    role,
    text: shortened.text,
    ...(raw.timestamp ? { timestamp: raw.timestamp } : {}),
    ...(shortened.clipped ? { clipped: true } : {}),
    ...(raw.tool ? { tool: raw.tool } : {}),
  };
}

/** Calls `onLine` for each line of the file with its 1-based number; `false` stops reading. */
async function eachLine(path: string, signal: AbortSignal | undefined, onLine: (line: number, text: string | null) => boolean): Promise<"done" | "stopped" | "budget"> {
  const stream = createReadStream(path, { highWaterMark: 256 * 1024 });
  const started = Date.now();
  let lineNumber = 1;
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let oversized = false;
  let total = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (signal?.aborted) return "stopped";
      total += chunk.length;
      if (total > BYTE_BUDGET || Date.now() - started > TIME_BUDGET_MS) return "budget";
      let start = 0;
      for (;;) {
        const newline = chunk.indexOf(10, start);
        if (newline === -1) {
          if (!oversized) {
            pending.push(chunk.subarray(start));
            pendingBytes += chunk.length - start;
            if (pendingBytes > PARSE_CAP) { oversized = true; pending = []; pendingBytes = 0; }
          }
          break;
        }
        let text: string | null = null;
        if (!oversized) {
          pending.push(chunk.subarray(start, newline));
          text = Buffer.concat(pending).toString("utf8");
        }
        const keepGoing = onLine(lineNumber, text);
        lineNumber += 1;
        pending = []; pendingBytes = 0; oversized = false;
        start = newline + 1;
        if (!keepGoing) return "stopped";
      }
    }
    if (!oversized && pendingBytes > 0) onLine(lineNumber, Buffer.concat(pending).toString("utf8"));
    return "done";
  } finally {
    stream.destroy();
  }
}

export async function readFileExcerpt(path: string, provider: string, options: ReadOptions): Promise<FileExcerpt> {
  const radius = Math.max(0, options.radius);
  const locate = options.query ? buildLocator(options.query, { regex: options.regex ?? false, caseSensitive: options.caseSensitive ?? false }) : null;
  const target = options.lineNumber;
  const before: Raw[] = [];
  const after: Raw[] = [];
  let hit: Raw | null = null;
  let opening: Raw | null = null;
  let dropped = false;
  let previous: Raw | null = null;
  // A digest (no line) keeps the last turns; an excerpt keeps `radius` on each side of the line.
  const keep = target === undefined ? radius * 2 + 1 : radius;
  const outcome = await eachLine(path, options.signal, (line, text) => {
    if (text === null) return true;
    const raw = toRaw(line, text, provider);
    if (!raw) return true;
    // Codex mirrors each message as an event and a response item: show it once.
    if (previous && previous.role === raw.role && previous.text === raw.text) return true;
    previous = raw;
    if (!opening && raw.role === "user") opening = raw;
    if (target === undefined || line < target) {
      before.push(raw);
      if (before.length > keep) { before.shift(); dropped = true; }
      return true;
    }
    if (line === target) { hit = raw; return radius > 0; }
    after.push(raw);
    return after.length < radius;
  });
  const found = hit as Raw | null;
  const first = opening as Raw | null;
  const messages = [
    ...before.map((raw) => finish(raw, CONTEXT_CHARS, locate)),
    ...(found ? [finish(found, TARGET_CHARS, locate)] : []),
    ...after.map((raw) => finish(raw, CONTEXT_CHARS, locate)),
  ];
  const openingShown = first !== null && messages.some((message) => message.line === first.line);
  return {
    messages,
    target: found ? before.length : null,
    more: dropped,
    opening: first && !openingShown ? finish(first, CONTEXT_CHARS, locate) : null,
    ...(outcome === "budget" ? { error: "This transcript is too large to read in full here." } : {}),
  };
}

/** Resolves the agent's own transcript files; a file name outside them is refused. */
export async function excerptForAgent(agentId: string, fileName: string | undefined, options: ReadOptions): Promise<Excerpt> {
  const record = (await loadAgentRecords()).find((candidate) => candidate.id === agentId);
  const empty: Excerpt = { messages: [], target: null, file: "main", more: false, opening: null };
  if (!record) return { ...empty, error: "This session is no longer on this host." };
  const { files, reason } = await resolveTranscripts(record);
  const file = fileName ? files.find((candidate) => basename(candidate.path) === fileName) : files.find((candidate) => candidate.kind === "main") ?? files[0];
  if (!file) {
    return { ...empty, error: reason === "unsupported-provider" ? "This provider keeps no transcript to read." : fileName ? "That part of the transcript is gone from disk." : "The transcript is gone from disk." };
  }
  try {
    return { ...(await readFileExcerpt(file.path, record.provider, options)), file: file.kind };
  } catch (error) {
    return { ...empty, file: file.kind, error: `Could not read the transcript: ${error instanceof Error ? error.message : String(error)}` };
  }
}
