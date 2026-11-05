import { z } from "zod";

/**
 * Transcript Search's agent tools as they appear in a chat, reduced to what a one-line row needs.
 * Pure, so the transformer and the tests read the same rules.
 */
export const TOOL_ROW_KIND = "transcript-search-tool-row";

const RowMessage = z.object({ role: z.string(), tool: z.string(), text: z.string(), target: z.boolean() });
const RowSession = z.object({ title: z.string(), workspace: z.string(), line: z.number().nullable(), text: z.string(), archived: z.boolean(), mark: z.tuple([z.number(), z.number()]).nullable() });

export const ToolRowSchema = z.object({
  tool: z.enum(["search", "read"]),
  state: z.enum(["running", "done", "failed"]),
  query: z.string(),
  scope: z.enum(["workspace", "project", "host"]),
  /** search: sessions that matched, best first, at most 10. */
  sessions: z.array(RowSession),
  /** search: matches in total when more than were listed. */
  total: z.number(),
  searched: z.number(),
  truncated: z.boolean(),
  /** read: which session and where. */
  title: z.string(),
  line: z.number().nullable(),
  messages: z.array(RowMessage),
  error: z.string(),
});
export type ToolRow = z.infer<typeof ToolRowSchema>;

const TOOL = /(?:^|__|\.|\/|:)(transcript_search_conversations|transcript_read_conversation)$/;

/** `mcp__paseo__transcript_search_conversations` (Claude), `paseo.transcript_read_conversation` (Codex), or bare. */
export function transcriptToolName(name: string): ToolRow["tool"] | null {
  const match = TOOL.exec(name);
  if (!match) return null;
  return match[1] === "transcript_search_conversations" ? "search" : "read";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The text a tool result carries, however the provider wrapped it. */
export function readText(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map((part) => typeof part === "string" ? part : record(part) && typeof part.text === "string" ? part.text : undefined);
    return parts.every((part) => part !== undefined) ? parts.join("\n") : undefined;
  }
  if (!record(value)) return undefined;
  if (record(value.structuredContent)) return JSON.stringify(value.structuredContent);
  const key = ["output", "content", "text", "message", "result"].find((name) => name in value);
  return key ? readText(value[key]) : undefined;
}

function json(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try { const value: unknown = JSON.parse(text); return record(value) ? value : null; } catch { return null; }
}

const str = (value: unknown, max = 400) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The first matching line, whitespace collapsed, with where the server's match sits in it. */
function snippetLine(snippet: unknown): { text: string; mark: [number, number] | null } {
  if (!record(snippet)) return { text: "", mark: null };
  const flat = (value: unknown) => str(value).replace(/\s+/g, " ");
  const before = flat(snippet.before).trimStart(), match = flat(snippet.match);
  const text = `${before}${match}${flat(snippet.after)}`.trimEnd().slice(0, 300);
  return { text, mark: match && before.length + match.length <= text.length ? [before.length, before.length + match.length] : null };
}

/** Builds a row from a tool call, or null when the call is not one of Transcript Search's. */
export function toolRow(name: string, status: string, detail: unknown, error: unknown): ToolRow | null {
  const tool = transcriptToolName(name);
  if (tool === null) return null;
  const input = record(detail) && record(detail.input) ? detail.input : {};
  const rawOutput = record(detail) && "output" in detail ? readText(detail.output) : undefined;
  const output = json(rawOutput);
  const failedOutput = record(detail) && record(detail.output) && detail.output.isError === true;
  const state: ToolRow["state"] = status === "failed" || failedOutput ? "failed" : status === "completed" ? "done" : "running";
  const scope = input.scope === "project" || input.scope === "host" ? input.scope : "workspace";
  const matches = output && Array.isArray(output.matches) ? output.matches.filter(record) : [];
  const messages = output && Array.isArray(output.messages) ? output.messages.filter(record) : [];
  const target = output ? num(output.target) : null;
  return {
    tool,
    state,
    query: str(input.query, 200),
    scope,
    sessions: matches.slice(0, 10).map((match) => ({
      title: str(match.title, 160) || "Untitled session",
      workspace: str(match.workspace, 160),
      line: Array.isArray(match.snippets) && record(match.snippets[0]) ? num(match.snippets[0].lineNumber) : null,
      ...(Array.isArray(match.snippets) ? snippetLine(match.snippets[0]) : { text: "", mark: null }),
      archived: match.archived === true,
    })),
    total: matches.length,
    searched: output ? num(output.searchedAgents) ?? 0 : 0,
    truncated: output?.outputTruncated === true,
    title: output ? str(output.title, 160) : "",
    line: num(input.line),
    messages: messages.slice(0, 17).map((message, index) => ({ role: str(message.role, 20), tool: str(message.tool, 60), text: str(message.text, 1200), target: index === target })),
    error: state === "failed" ? (readText(error) || rawOutput || "").slice(0, 500) : "",
  };
}

const SCOPE: Record<ToolRow["scope"], string> = { workspace: "past sessions", project: "this project's past sessions", host: "every past session on this host" };

/** The row's one line. */
export function rowLine(row: ToolRow): string {
  if (row.tool === "search") {
    const what = `${SCOPE[row.scope]} for “${row.query}”`;
    if (row.state === "running") return `Searching ${what}…`;
    if (row.state === "failed") return `Couldn't search ${what}`;
    if (row.total === 0) return `Searched ${what} · none found`;
    return `Searched ${what} · ${row.total}${row.truncated ? "+" : ""} found`;
  }
  const title = row.title ? `“${row.title}”` : "a past session";
  if (row.state === "running") return `Reading ${title}…`;
  if (row.state === "failed") return `Couldn't read ${title}`;
  return row.line === null ? `Read how ${title} went` : `Read ${title} around line ${row.line}`;
}
