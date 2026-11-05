import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function tools(stubs = {}, read) {
  const bundle = await build({ entryPoints: ["server/native-tools.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "fixture-services", setup(build) { build.onResolve({ filter: /^\./ }, args => Object.hasOwn(stubs, args.path) ? { path: "fixture:" + args.path, external: true } : undefined); } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(id => id.startsWith("fixture:") ? stubs[id.slice(8)] : require(id), module, module.exports);
  let open;
  module.exports.contributeAgentTools({ before(name, handler) { assert.equal(name, "agent.session_open"); open = handler; return () => {}; } }, read);
  const request = { purpose: "interactive", provider: "claude", labels: {}, workspaceId: "w1", tools: [] };
  return { definitions: open({ request }).tools, module: module.exports };
}
const context = () => ({ agent: { id: "caller", workspaceId: "w1", provider: "claude", cwd: "/fixture", title: "Fixture" }, paseo: {}, signal: new AbortController().signal });
async function call(tool, input, ctx = context()) { return tool.execute(tool.input.parse(input), ctx); }
test("conversation search defaults to the caller workspace and explicitly expands scope", async () => {
  const requests = [];
  const census = { projects: [], workspaces: [{ workspaceId: "w1", projectId: "p1" }, { workspaceId: "w2", projectId: "p1" }, { workspaceId: "w3", projectId: "p2" }], agents: [{ id: "own", workspaceId: "w1", transcript: { searchable: true } }, { id: "project", workspaceId: "w2", transcript: { searchable: true } }, { id: "foreign", workspaceId: "w3", transcript: { searchable: true } }] };
  const { definitions } = await tools({ "./census": { buildCensus: async () => census }, "./search": { runSearch: async input => { requests.push(input); return { matches: [], searchedAgents: input.agentIds.length, outputTruncated: false }; } } });
  await call(definitions[0], { query: "needle" }); assert.deepEqual(requests.at(-1).agentIds, ["own"]);
  await call(definitions[0], { query: "needle", scope: "project" }); assert.deepEqual(requests.at(-1).agentIds, ["own", "project"]);
  await call(definitions[0], { query: "needle", scope: "host" }); assert.equal(requests.at(-1).agentIds.length, 3);
  census.agents = Array.from({ length: 2001 }, (_, i) => ({ id: String(i), workspaceId: "w1", transcript: { searchable: true } })); requests.length = 0;
  const result = await call(definitions[0], { query: "needle" }); assert.equal(requests.length, 2); assert.equal(result.structuredContent.searchedAgents, 2001);
});

test("search results name each session, and the read tool returns the turns around a line", async () => {
  process.env.PASEO_SERVER_ID = "srv_fixture";
  const census = {
    projects: [{ projectId: "p1", displayName: "billing-service", customName: null, rootPath: "/code/billing", archivedAt: null }],
    workspaces: [{ workspaceId: "w1", projectId: "p1", cwd: "/code/billing", title: "Invoice retry backoff", displayName: "retries", branch: "feat/retries", archivedAt: null }],
    agents: [{ id: "a1", workspaceId: "w1", provider: "claude", title: "Add backoff", model: "claude-opus-5-5", archivedAt: null, createdAt: "2026-10-01T00:00:00Z", lastActivityAt: "2026-10-02T00:00:00Z", transcript: { searchable: true } }],
  };
  const reads = [];
  const excerpt = { messages: [{ line: 3, role: "user", text: "Keep one key." }, { line: 4, role: "assistant", text: "Derived from the invoice id." }], target: 1, file: "main", more: false, opening: null };
  const { definitions } = await tools({
    "./census": { buildCensus: async () => census },
    "./search": { runSearch: async () => ({ matches: [{ agentId: "a1", snippets: [{ file: "main", lineNumber: 4, role: "assistant", before: "", match: "invoice", after: " id" }], truncated: false, hitCount: 1 }], searchedAgents: 1, outputTruncated: false }) },
    "./excerpt": { excerptForAgent: async (agentId, fileName, options) => { reads.push({ agentId, fileName, ...options, signal: undefined }); return excerpt; } },
  });
  assert.deepEqual(definitions.map((tool) => tool.name), ["transcript_search_conversations", "transcript_read_conversation"]);
  const found = await call(definitions[0], { query: "invoice" });
  assert.deepEqual([found.structuredContent.query, found.structuredContent.matches[0].title, found.structuredContent.matches[0].workspace, found.structuredContent.matches[0].provider], ["invoice", "Add backoff", "Invoice retry backoff · billing-service · feat/retries", "Claude"]);
  const read = await call(definitions[1], { agentId: "a1", line: 4, query: "invoice" });
  assert.deepEqual(reads, [{ agentId: "a1", fileName: undefined, lineNumber: 4, radius: 3, signal: undefined, query: "invoice" }]);
  assert.match(read.text, /^Session: Add backoff\nAgent ID: a1 \(Claude, claude-opus-5-5\) on Paseo host srv_fixture/);
  assert.match(read.text, /Agent \(line 4\) \[match\]:\nDerived from the invoice id\./);
  assert.equal(read.structuredContent.title, "Add backoff");
  const unknown = await call(definitions[1], { agentId: "nope" });
  assert.equal(unknown.isError, true);
  await assert.rejects(async () => definitions[1].input.parse({ agentId: "a1", radius: 99 }));
  delete process.env.PASEO_SERVER_ID;
});
