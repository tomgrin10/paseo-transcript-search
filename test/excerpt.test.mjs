import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
async function load(entry) {
  const built = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", external: ["@getpaseo/plugin", "zod"] });
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

/** An isolated Paseo home with one Claude session (and a subagent) and one archived Codex session. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "paseo-excerpt-test-"));
  const previous = Object.fromEntries(["PASEO_HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "PASEO_SERVER_ID"].map((key) => [key, process.env[key]]));
  process.env.PASEO_HOME = join(root, "paseo");
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  process.env.PASEO_SERVER_ID = "srv_fixture";
  const json = async (file, value) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, JSON.stringify(value)); };
  const lines = async (file, values) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, values.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join("\n") + "\n"); };
  for (const [id, provider, extra] of [["claude-1", "claude", {}], ["codex-1", "codex", { archivedAt: "2026-10-03T00:00:00Z" }]]) {
    await json(join(process.env.PASEO_HOME, "agents", "bucket", `${id}.json`), { id, provider, cwd: "/fixture", workspaceId: "w1", title: `${provider} session`, createdAt: "2026-10-01T00:00:00Z", lastActivityAt: provider === "claude" ? "2026-10-04T00:00:00Z" : "2026-10-02T00:00:00Z", lastStatus: "idle", persistence: { sessionId: id, nativeHandle: id, metadata: { secret: "MUST-NOT-RETURN" } }, ...extra });
  }
  await json(join(process.env.PASEO_HOME, "projects", "projects.json"), [{ projectId: "p1", rootPath: "/fixture", displayName: "billing-service" }]);
  await json(join(process.env.PASEO_HOME, "projects", "workspaces.json"), [{ workspaceId: "w1", projectId: "p1", cwd: "/fixture", title: "Invoice retry backoff", branch: "feat/retries" }]);
  const user = (text) => ({ type: "user", timestamp: "2026-10-04T10:00:00Z", message: { role: "user", content: text } });
  const agent = (text) => ({ type: "assistant", timestamp: "2026-10-04T10:01:00Z", message: { role: "assistant", content: [{ type: "text", text }] } });
  const project = join(process.env.CLAUDE_CONFIG_DIR, "projects", "-fixture");
  await lines(join(project, "claude-1.jsonl"), [
    { type: "summary", summary: "Retries" },
    user("Add backoff and keep one idempotency key per invoice."),
    agent("Reading the worker first."),
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "npm test -- retry", description: "Run tests" } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "PASS retry.test.ts" }] } },
    `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"${"x".repeat(1_100_000)}"}]}}`,
    agent(`The loop made a new idempotency key on every attempt. ${"Long explanation. ".repeat(300)}Fixed by deriving it from the invoice id.`),
    user("Add a metric."),
    agent("Added billing.charge_retries_exhausted."),
    user("Thanks."),
  ]);
  await lines(join(project, "claude-1", "subagents", "agent-sub1.jsonl"), [{ type: "user", message: { role: "user", content: "Find the raw body readers." } }, agent("Only stripe.ts needs the raw body.")]);
  const codexLine = (type, payload) => ({ timestamp: "2026-10-02T00:00:00Z", type, payload });
  await lines(join(process.env.CODEX_HOME, "archived_sessions", "rollout-2026-10-01T00-00-00-codex-1.jsonl"), [
    codexLine("session_meta", { id: "codex-1" }),
    codexLine("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Review the retry PR" }] }),
    codexLine("event_msg", { type: "user_message", message: "Review the retry PR" }),
    codexLine("response_item", { type: "function_call", name: "shell", arguments: JSON.stringify({ command: ["bash", "-lc", "gh pr diff 412"] }) }),
    codexLine("response_item", { type: "function_call_output", output: JSON.stringify({ output: "+ const key = invoice.id", metadata: { exit_code: 0 } }) }),
    codexLine("event_msg", { type: "agent_message", message: "The key changes when the card does." }),
    codexLine("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "The key changes when the card does." }] }),
  ]);
  const handlers = new Map();
  const server = await load("index.server.ts");
  const cleanup = server.default({ before() { return () => {}; }, registerSettings() {}, handle(contract, callback) { handlers.set(contract.name, { contract, callback }); } });
  const invoke = async (name, input) => { const { contract, callback } = handlers.get(name); return contract.output.parse(await callback(contract.input.parse(input), {})); };
  return {
    invoke,
    async close() {
      await cleanup?.();
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("the preview reads the turns around a line, skipping oversized lines and Codex's mirrored messages", async () => {
  const f = await fixture();
  try {
    const around = await f.invoke("transcript-search.excerpt", { agentId: "claude-1", lineNumber: 7, radius: 2, query: "invoice id" });
    assert.deepEqual(around.messages.map((message) => [message.line, message.role]), [[4, "tool"], [5, "tool"], [7, "assistant"], [8, "user"], [9, "assistant"]], "line 6 is over the parse cap and is skipped");
    assert.equal(around.target, 2);
    assert.deepEqual([around.messages[0].tool, around.messages[0].text], ["Bash", "npm test -- retry"], "a tool call reads as its command");
    assert.ok(around.messages[2].clipped);
    assert.ok(around.messages[2].text.includes("invoice id"), "a long matched message is cut around the match");
    assert.ok(around.messages[2].text.length <= 2402);
    assert.equal(around.more, true);
    assert.equal(around.opening.line, 2, "the opening request is offered when it is outside the excerpt");
    assert.equal(around.file, "main");

    const digest = await f.invoke("transcript-search.excerpt", { agentId: "claude-1", radius: 1 });
    assert.equal(digest.target, null);
    assert.deepEqual(digest.messages.map((message) => message.line), [8, 9, 10], "without a line: the last turns");

    const sub = await f.invoke("transcript-search.excerpt", { agentId: "claude-1", fileName: "agent-sub1.jsonl", lineNumber: 2, radius: 1 });
    assert.equal(sub.file, "subagent");
    assert.equal(sub.messages[sub.target].text, "Only stripe.ts needs the raw body.");
    const refused = await f.invoke("transcript-search.excerpt", { agentId: "claude-1", fileName: "../codex-1.jsonl", lineNumber: 2 });
    assert.equal(refused.messages.length, 0);
    assert.match(refused.error, /gone from disk/, "only the session's own files can be read");

    const codex = await f.invoke("transcript-search.excerpt", { agentId: "codex-1", lineNumber: 6, radius: 3 });
    assert.deepEqual(codex.messages.map((message) => message.text), ["Review the retry PR", "gh pr diff 412", "+ const key = invoice.id", "The key changes when the card does."]);
    assert.equal(codex.target, 3);
    const missing = await f.invoke("transcript-search.excerpt", { agentId: "nobody", lineNumber: 1 });
    assert.match(missing.error, /no longer on this host/);
    assert.ok(!JSON.stringify([around, digest, codex]).includes("MUST-NOT-RETURN"));
  } finally { await f.close(); }
});

test("snippets name their transcript file so subagent lines can be previewed", async () => {
  const f = await fixture();
  try {
    const result = await f.invoke("agents-history.search", { query: "raw body", mode: "regex", agentIds: ["claude-1"] });
    assert.deepEqual([...new Set(result.matches[0].snippets.map((snippet) => `${snippet.file}:${snippet.fileName}`))], ["subagent:agent-sub1.jsonl"]);
  } finally { await f.close(); }
});

test("the composer's Past conversation source lists recent sessions and matches with readable context", async () => {
  const f = await fixture();
  try {
    const recent = await f.invoke("transcript-search.attach-search", { query: "" });
    assert.deepEqual(recent.items.map((item) => item.title), ["claude session", "codex session"], "newest first");
    assert.equal(recent.items[0].url, "https://app.paseo.sh/h/srv_fixture/agent/claude-1");
    assert.equal(recent.items[0].resourceType, "conversation");
    assert.match(recent.items[0].text, /It started with:\n\nUser \(line 2\):\nAdd backoff/);
    assert.match(recent.items[0].text, /Its last turns:/);

    const matched = await f.invoke("transcript-search.attach-search", { query: "idempotency" });
    assert.deepEqual(matched.items.map((item) => item.id), ["claude-1"]);
    assert.match(matched.items[0].subtitle, /^“….{0,10}idempotency.*” · Invoice retry backoff · Claude · Oct 4$/, "Paseo's picker filters rows by what was typed, so the subtitle leads with the match");
    assert.equal(matched.items[0].identifier, "", "the picker prints the identifier before the title");
    assert.match(matched.items[0].text, /Session: claude session\nAgent ID: claude-1 \(Claude\) on Paseo host srv_fixture/);
    assert.match(matched.items[0].text, /\[match\]/);
    assert.match(matched.items[0].text, /transcript_read_conversation/);
    assert.ok(!JSON.stringify(matched).includes("MUST-NOT-RETURN"));
    assert.ok(matched.items[0].text.length <= 12_000);
  } finally { await f.close(); }
});
