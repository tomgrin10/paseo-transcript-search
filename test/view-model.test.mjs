import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
async function load(entry) {
  const built = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["@getpaseo/plugin", "zod"] });
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const marked = (parts) => parts.filter((part) => part.mark).map((part) => part.text);

test("every occurrence is marked the way each engine matches", async () => {
  const { segments } = await load("shared/highlight.ts");
  const q = (query, extra = {}) => ({ query, regex: false, caseSensitive: false, ranked: false, ...extra });
  assert.deepEqual(marked(segments("The idempotency key and Idempotency-Key header", q("idempotency"))), ["idempotency", "Idempotency"]);
  assert.deepEqual(marked(segments("The idempotency key and Idempotency-Key header", q("Idempotency", { caseSensitive: true }))), ["Idempotency"]);
  assert.deepEqual(marked(segments("a.b axb", q("a.b"))), ["a.b"], "a literal dot is not a wildcard");
  assert.deepEqual(marked(segments("retry 429 then 503", q("\\d{3}", { regex: true }))), ["429", "503"]);
  assert.deepEqual(marked(segments("retry webhook deliveries; webhooks retried", q("webhook retr", { ranked: true }))), ["retry", "webhook", "webhooks", "retried"], "ranked marks each word as a prefix");
  assert.deepEqual(marked(segments("unbalanced", q("(", { regex: true }), { start: 0, end: 2 })), ["un"], "an unreadable pattern falls back to the server's span");
  assert.deepEqual(segments("plain", q("   ")), [{ text: "plain", mark: false }]);
});

const census = (now) => ({
  projects: [{ projectId: "p", displayName: "billing-service", customName: null, rootPath: "/code/billing", kind: "git", archivedAt: null }],
  workspaces: [
    { workspaceId: "w1", projectId: "p", cwd: "/code/billing/a", kind: null, displayName: "invoice-retries", title: "Invoice retry backoff", branch: "feat/invoice-retries", createdAt: null, updatedAt: null, archivedAt: null, pinnedAt: null, autoArchivedChangeRequestUrl: null, labels: [] },
    { workspaceId: "w2", projectId: "p", cwd: "/code/billing/b", kind: null, displayName: "webhooks", title: "Stripe webhook signatures", branch: "fix/webhook-signature", createdAt: null, updatedAt: null, archivedAt: new Date(now - 10 * 864e5).toISOString(), pinnedAt: null, autoArchivedChangeRequestUrl: null, labels: [] },
  ],
  agents: [
    { id: "today", workspaceId: "w1", provider: "claude", title: "Add backoff", status: "idle", archivedAt: null, createdAt: new Date(now - 3600e3).toISOString(), lastActivityAt: new Date(now - 3600e3).toISOString(), model: null, transcript: { searchable: true, fileCount: 1 } },
    { id: "older", workspaceId: "w2", provider: "codex", title: "Verify signatures", status: "idle", archivedAt: new Date(now - 10 * 864e5).toISOString(), createdAt: new Date(now - 12 * 864e5).toISOString(), lastActivityAt: new Date(now - 12 * 864e5).toISOString(), model: null, transcript: { searchable: true, fileCount: 1 } },
    { id: "named", workspaceId: "w2", provider: "cursor", title: "Webhook notes", status: "idle", archivedAt: null, createdAt: new Date(now - 11 * 864e5).toISOString(), lastActivityAt: null, model: null, transcript: { searchable: false, reason: "unsupported-provider", fileCount: 0 } },
  ],
  generatedAt: new Date(now).toISOString(),
});

test("results are sessions grouped by day, newest first, or ranked by score", async () => {
  const { scopeHistory, hostKey } = await load("shared/host-model.ts");
  const { EMPTY_FILTERS } = await load("shared/model.ts");
  const { buildResults, groupResults } = await load("shared/results.ts");
  const now = Date.parse("2026-11-05T15:00:00");
  const rows = scopeHistory({ serverId: "laptop", label: "Laptop" }, census(now)).rows;
  const browse = buildResults(rows, EMPTY_FILTERS, { nowMs: now, matches: null, ranked: false });
  assert.deepEqual(browse.map((result) => result.agent.title), ["Add backoff", "Webhook notes", "Verify signatures"]);
  assert.equal(browse[0].host.label, "Laptop");
  assert.equal(browse[0].info.workspaceLine, "Invoice retry backoff · billing-service · feat/invoice-retries");
  assert.equal(browse[2].info.archived, true);
  assert.deepEqual(groupResults(browse, now, false).map((group) => [group.label, group.results.length]), [["Today", 1], ["This month", 2]]);

  const match = (agentId, score) => ({ agentId: hostKey("laptop", agentId), snippets: [{ file: "main", lineNumber: 4, role: "assistant", before: "", match: "webhook", after: "" }], truncated: false, hitCount: 1, score });
  const matches = new Map([match("today", 2), match("older", 9)].map((entry) => [entry.agentId, entry]));
  const literal = buildResults(rows, { ...EMPTY_FILTERS, query: "webhook" }, { nowMs: now, matches, ranked: false });
  assert.deepEqual(literal.map((result) => [result.agent.title, result.nameMatch]), [["Add backoff", false], ["Webhook notes", true], ["Verify signatures", false]], "a name match without a transcript still shows");
  const ranked = buildResults(rows, { ...EMPTY_FILTERS, query: "webhook", ranked: true }, { nowMs: now, matches, ranked: true });
  assert.deepEqual(ranked.map((result) => result.agent.title), ["Verify signatures", "Add backoff", "Webhook notes"]);
  assert.deepEqual(groupResults(ranked, now, true).map((group) => group.label), ["Best matches"]);
  const active = buildResults(rows, { ...EMPTY_FILTERS, archived: "active" }, { nowMs: now, matches: null, ranked: false });
  assert.deepEqual(active.map((result) => result.agent.title), ["Add backoff"]);
  assert.equal(buildResults(rows, EMPTY_FILTERS, { nowMs: now, matches: null, ranked: false, hostIds: new Set(["other"]) }).length, 0);
});

test("the keyboard walks match lines across sessions and keeps its place through refreshes", async () => {
  const { cursorsOf, moveCursor, reconcileCursor, noResultSuggestions, activeFilterCount } = await load("shared/results.ts");
  const { EMPTY_FILTERS } = await load("shared/model.ts");
  const session = (key, count) => ({ key, match: count === null ? null : { snippets: Array.from({ length: count }, () => ({})) } });
  const groups = [{ label: "Today", results: [session("a", 2), session("b", null)] }, { label: "Earlier", results: [session("c", 5)] }];
  const cursors = cursorsOf(groups, 3);
  assert.deepEqual(cursors, [{ key: "a", snippet: 0 }, { key: "a", snippet: 1 }, { key: "b", snippet: null }, { key: "c", snippet: 0 }, { key: "c", snippet: 1 }, { key: "c", snippet: 2 }]);
  assert.deepEqual(moveCursor(cursors, null, 1), { key: "a", snippet: 0 });
  assert.deepEqual(moveCursor(cursors, null, -1), { key: "c", snippet: 2 });
  assert.deepEqual(moveCursor(cursors, { key: "a", snippet: 1 }, 1), { key: "b", snippet: null });
  assert.deepEqual(moveCursor(cursors, { key: "c", snippet: 2 }, 1), { key: "c", snippet: 2 }, "the last line stays put");
  assert.deepEqual(reconcileCursor(cursors, { key: "c", snippet: 9 }), { key: "c", snippet: 0 }, "a vanished line falls back to its session");
  assert.deepEqual(reconcileCursor(cursors, { key: "gone", snippet: 0 }), { key: "a", snippet: 0 });
  assert.equal(reconcileCursor([], { key: "a", snippet: 0 }), null);

  assert.deepEqual(noResultSuggestions(EMPTY_FILTERS), []);
  const narrowed = { ...EMPTY_FILTERS, archived: "active", providers: new Set(["claude"]), caseSensitive: true, regex: true };
  assert.equal(activeFilterCount(narrowed, new Set(["host"])), 3);
  assert.deepEqual(noResultSuggestions(narrowed, new Set(["host"])), ["include-archived", "clear-filters", "ignore-case", "literal"]);
  assert.deepEqual(noResultSuggestions({ ...EMPTY_FILTERS, ranked: true, caseSensitive: true }), [], "Best match already ignores case");
});

test("recent searches keep the newest eight, once each", async () => {
  const { addRecent, MAX_RECENT } = await load("client/recent.ts");
  let list = [];
  for (const query of ["webhook", "retry", "x", "  WEBHOOK ", ...Array.from({ length: 10 }, (_, index) => `q${index}`)]) list = addRecent(list, query);
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list[0], "q9");
  assert.ok(!list.includes("x"), "one letter is not a search");
  assert.equal(addRecent(["webhook"], "Webhook")[0], "Webhook");
  assert.equal(addRecent(["webhook"], "Webhook").length, 1);
});

test("agent tool calls become one-line rows for Claude and Codex names", async () => {
  const { toolRow, rowLine, transcriptToolName } = await load("shared/chat.ts");
  assert.equal(transcriptToolName("mcp__paseo__transcript_search_conversations"), "search");
  assert.equal(transcriptToolName("paseo.transcript_read_conversation"), "read");
  assert.equal(transcriptToolName("mcp__other__transcript_search_conversations_v2"), null);
  assert.equal(toolRow("Bash", "completed", {}, null), null);
  const output = { content: [{ type: "text", text: JSON.stringify({ query: "idempotency", searchedAgents: 4, outputTruncated: false, matches: [{ agentId: "a", title: "Fix duplicate webhook deliveries", workspace: "Webhook delivery dedupe", archived: true, snippets: [{ lineNumber: 9, before: "an  ", match: "Idempotency-Key", after: " header" }] }] }) }] };
  const search = toolRow("mcp__paseo__transcript_search_conversations", "completed", { type: "unknown", input: { query: "idempotency", scope: "host" }, output }, null);
  assert.equal(rowLine(search), "Searched every past session on this host for “idempotency” · 1 found");
  assert.deepEqual(search.sessions[0], { title: "Fix duplicate webhook deliveries", workspace: "Webhook delivery dedupe", line: 9, text: "an Idempotency-Key header", mark: [3, 18], archived: true });
  assert.equal(rowLine({ ...search, state: "running" }), "Searching every past session on this host for “idempotency”…");
  assert.equal(rowLine({ ...search, total: 0, sessions: [] }), "Searched every past session on this host for “idempotency” · none found");
  const failed = toolRow("paseo.transcript_search_conversations", "failed", { input: { query: "x" } }, "grep is not installed");
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "grep is not installed");
  const read = toolRow("mcp__paseo__transcript_read_conversation", "completed", { input: { agentId: "a", line: 9 }, output: { structuredContent: { title: "Fix duplicate webhook deliveries", target: 1, messages: [{ role: "user", text: "Why?" }, { role: "assistant", text: "Because." }] } } }, null);
  assert.equal(rowLine(read), "Read “Fix duplicate webhook deliveries” around line 9");
  assert.deepEqual(read.messages.map((message) => message.target), [false, true]);
});

test("result lines lead with the match and read Codex shell output, not its JSON envelope", async () => {
  const { snippetText, LEAD_CHARS } = await load("shared/snippet-text.ts");
  const long = snippetText({ role: "assistant", before: "…" + "word ".repeat(40), match: "idempotency", after: " key." });
  assert.ok(long.value.indexOf("idempotency") <= LEAD_CHARS + 2);
  assert.equal(long.value.slice(long.fallback.start, long.fallback.end), "idempotency");
  const envelope = snippetText({ role: "tool", before: '{"output":"diff --git a/retry.ts\\n+ const ', match: "idempotency", after: 'Key = 1;\\n","metadata":{"exit_code":0,"duration_seconds":1.2}}' });
  assert.equal(envelope.value, "diff --git a/retry.ts + const idempotencyKey = 1; ");
  assert.equal(envelope.value.slice(envelope.fallback.start, envelope.fallback.end), "idempotency");
  const plain = snippetText({ role: "tool", before: "PASS ", match: "retry", after: ".test.ts" });
  assert.equal(plain.value, "PASS retry.test.ts", "ordinary tool output is left alone");
});

test("Attach asks the result's host by the raw agent id, never the host-scoped key", async () => {
  const { attachRequest, isSameSession } = await load("shared/results.ts");
  const result = { key: JSON.stringify(["srv_a", "past-retries"]) };
  const line = { file: "main", lineNumber: 4, role: "user", before: "", match: "idempotency", after: "" };
  const q = { query: "idempotency", regex: false, caseSensitive: true, ranked: false };
  assert.deepEqual(attachRequest(result, line, q, 3), { agentId: "past-retries", query: "idempotency", regex: false, caseSensitive: true, snippet: line, hitCount: 3 });
  assert.deepEqual(attachRequest(result, null, q, 0), { agentId: "past-retries" }, "a session previewed by its opening and last turns sends no line");
  assert.equal(isSameSession(result, "past-retries"), true);
  assert.equal(isSameSession(result, JSON.stringify(["srv_a", "past-retries"])), false, "from is a raw id; only the raw id compares");
  assert.equal(isSameSession(result, null), false);
});
