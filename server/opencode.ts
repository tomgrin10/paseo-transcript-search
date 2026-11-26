import { readdir, mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { paseoHome } from "./paseo-home";

/**
 * OpenCode keeps its sessions in a SQLite database under its data directory
 * (`~/.local/share/opencode/opencode.db` by default): one row per message in
 * `session_message`, with the message's parts (text, reasoning, tool calls)
 * inside the row's JSON `data`. There is no per-session transcript file for
 * `grep` to read, so the search pipeline gets one: this module exports a
 * session's messages to a small JSONL cache under the plugin's data directory,
 * in a record shape `classifyOpencode` understands. The cache is rewritten
 * only when the session gained messages.
 *
 * The database is opened read-only and the export writes to the plugin's own
 * directory, never to OpenCode's.
 */

const EXPORT_TTL_MS = 30_000;
/** One lookup miss rescans the data directory at most this often. */
const SCAN_MISS_TTL_MS = 5_000;

interface SessionLocation {
  path: string;
  table: "session_v2" | "session";
}

interface CacheEntry {
  key: string;
  exportedAt: number;
  value: string | null;
}

const locations = new Map<string, CacheEntry>();
let scanMissAt = 0;

export function opencodeDataDir(): string {
  const base = process.env.OPENCODE_DATA_DIR
    ?? (process.env.XDG_DATA_HOME && !process.env.XDG_DATA_HOME.startsWith("~") ? process.env.XDG_DATA_HOME : join(homedir(), ".local/share"));
  return join(base, "opencode");
}

export function opencodeCacheDirectory(): string {
  return join(paseoHome(), "plugin-data", "agents-history", "opencode-cache");
}

function listDatabases(): Promise<string[]> {
  return readdir(opencodeDataDir())
    .then((entries) => entries.filter((name) => /^opencode.*\.db$/.test(name)).map((name) => join(opencodeDataDir(), name)))
    .catch(() => []);
}

function openReadOnly(path: string): DatabaseSync | null {
  try {
    const getBuiltin = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    if (typeof getBuiltin !== "function") return null;
    const sqlite = getBuiltin.call(process, "node:sqlite") as typeof import("node:sqlite") | undefined;
    if (!sqlite) return null;
    return new sqlite.DatabaseSync(path, { readOnly: true, timeout: 2_000 });
  } catch {
    return null;
  }
}

function tablesOf(db: DatabaseSync): Set<string> {
  const names = new Set<string>();
  try {
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>) {
      names.add(row.name);
    }
  } catch { /* an unreadable or foreign database is simply skipped */ }
  return names;
}

/** Finds the database that holds this session, scanning the data directory at most every few seconds. */
async function locateSession(sessionId: string): Promise<SessionLocation | null> {
  const cached = locations.get(sessionId);
  if (cached && cached.key === sessionId && Date.now() - cached.exportedAt < EXPORT_TTL_MS) return cached.value ? { path: cached.value, table: "session_v2" } : null;
  const databases = await listDatabases();
  if (databases.length === 0 && Date.now() - scanMissAt < SCAN_MISS_TTL_MS) return null;
  scanMissAt = Date.now();
  let found: SessionLocation | null = null;
  for (const path of databases) {
    const db = openReadOnly(path);
    if (!db) continue;
    try {
      const tables = tablesOf(db);
      const table = tables.has("session_v2") ? "session_v2" : tables.has("session") ? "session" : null;
      if (!table) continue;
      const hit = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(sessionId);
      if (hit) found = { path, table };
    } catch { /* try the next database */ } finally {
      db.close();
    }
    if (found) break;
  }
  locations.set(sessionId, { key: sessionId, exportedAt: Date.now(), value: found?.path ?? null });
  return found;
}

interface MessageRow {
  type: string;
  seq: number;
  time_created: number;
  data: string;
}

function isoTime(ms: number | undefined | null): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Turns one stored message into zero or more export records. */
function exportMessage(row: MessageRow): Array<{ role: "user" | "assistant" | "tool"; text: string; timestamp?: string }> {
  const timestamp = isoTime(row.time_created);
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  if (row.type === "user") {
    const text = textOf(record["text"]).trim();
    if (!text || text.startsWith("<")) return [];
    return [{ role: "user", text, ...(timestamp ? { timestamp } : {}) }];
  }
  if (row.type !== "assistant") return [];
  const out: Array<{ role: "user" | "assistant" | "tool"; text: string; timestamp?: string }> = [];
  const spoken: string[] = [];
  const content = record["content"];
  if (!Array.isArray(content)) return [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const entry = part as Record<string, unknown>;
    if (entry["type"] === "text") {
      const text = textOf(entry["text"]).trim();
      if (text) spoken.push(text);
      continue;
    }
    if (entry["type"] === "tool") {
      const name = textOf(entry["name"]) || "tool";
      const state = entry["state"];
      const input = state && typeof state === "object" ? (state as Record<string, unknown>)["input"] : undefined;
      let args = "";
      try {
        args = typeof input === "string" ? input : JSON.stringify(input) ?? "";
      } catch {
        args = "";
      }
      if (args.trim()) out.push({ role: "tool", text: `${name} ${args}`, ...(timestamp ? { timestamp } : {}) });
      const output = state && typeof state === "object" ? (state as Record<string, unknown>)["content"] : undefined;
      const result = textParts(output);
      if (result.trim()) out.push({ role: "tool", text: result, ...(timestamp ? { timestamp } : {}) });
    }
  }
  if (spoken.length > 0) out.unshift({ role: "assistant", text: spoken.join("\n"), ...(timestamp ? { timestamp } : {}) });
  return out;
}

function textParts(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object") {
      const text = textOf((part as Record<string, unknown>)["text"]);
      if (text) parts.push(text);
    } else if (typeof part === "string") {
      parts.push(part);
    }
  }
  return parts.join("\n");
}

interface ExportMeta {
  seq: number;
  messages: number;
}

async function readMeta(path: string): Promise<ExportMeta | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed && typeof parsed === "object" && typeof (parsed as ExportMeta).seq === "number") return parsed as ExportMeta;
  } catch { /* no meta yet */ }
  return null;
}

async function latestSeq(db: DatabaseSync, table: "session_v2" | "session", sessionId: string): Promise<{ seq: number; messages: number } | null> {
  const legacy = table === "session";
  // The current schema keeps messages in `session_message`; older builds used `message`.
  const messageTable = legacy ? (tablesOf(db).has("message") ? "message" : null) : tablesOf(db).has("session_message") ? "session_message" : null;
  if (!messageTable) return null;
  try {
    const row = db
      .prepare(`SELECT count(*) AS messages, coalesce(max(seq), 0) AS seq FROM ${messageTable} WHERE session_id = ?`)
      .get(sessionId) as { messages: number; seq: number } | undefined;
    return row ? { seq: row.seq ?? 0, messages: row.messages ?? 0 } : null;
  } catch {
    // The legacy table has no `seq`; fall back to a plain count.
    try {
      const row = db.prepare(`SELECT count(*) AS messages FROM ${messageTable} WHERE session_id = ?`).get(sessionId) as { messages: number } | undefined;
      return row ? { seq: row.messages ?? 0, messages: row.messages ?? 0 } : null;
    } catch {
      return null;
    }
  }
}

async function exportSession(location: SessionLocation, sessionId: string, cachePath: string, metaPath: string): Promise<string | null> {
  const db = openReadOnly(location.path);
  if (!db) return null;
  try {
    const current = await latestSeq(db, location.table, sessionId);
    if (!current) return null;
    const previous = await readMeta(metaPath);
    if (previous && previous.seq >= current.seq && previous.messages >= current.messages) {
      try {
        await stat(cachePath);
        return cachePath;
      } catch {
        // The cache file is gone; export again below.
      }
    }
    const messageTable = location.table === "session" ? "message" : "session_message";
    let rows: MessageRow[];
    try {
      rows = db
        .prepare(`SELECT type, seq, time_created, data FROM ${messageTable} WHERE session_id = ? ORDER BY seq ASC`)
        .all(sessionId) as unknown as MessageRow[];
    } catch {
      rows = db
        .prepare(`SELECT type, rowid AS seq, time_created, data FROM ${messageTable} WHERE session_id = ? ORDER BY rowid ASC`)
        .all(sessionId) as unknown as MessageRow[];
    }
    const lines: string[] = [];
    for (const row of rows) {
      for (const entry of exportMessage(row)) {
        lines.push(JSON.stringify({ provider: "opencode", ...entry }));
      }
    }
    const directory = opencodeCacheDirectory();
    await mkdir(directory, { recursive: true });
    const temporary = `${cachePath}.tmp`;
    await writeFile(temporary, `${lines.join("\n")}\n`);
    await rename(temporary, cachePath);
    await writeFile(metaPath, JSON.stringify({ seq: current.seq, messages: current.messages }));
    return cachePath;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Resolves an OpenCode session to its exported transcript file, exporting it
 * first when the cache is missing or stale. Returns `null` when the session is
 * unknown to the local OpenCode database.
 */
export async function resolveOpencodeTranscript(sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const location = await locateSession(sessionId);
  if (!location) return null;
  const cachePath = join(opencodeCacheDirectory(), `${sessionId}.jsonl`);
  const metaPath = `${cachePath}.meta`;
  return exportSession(location, sessionId, cachePath, metaPath);
}

/** Test hook: forget cached locations and scan timestamps. */
export function clearOpencodeCaches(): void {
  locations.clear();
  scanMissAt = 0;
}
