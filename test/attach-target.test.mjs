import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";

async function load() {
  const built = await build({ entryPoints: ["client/attach-target.ts"], bundle: true, write: false, platform: "neutral", format: "cjs", external: ["@getpaseo/plugin"] });
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(() => ({}), module, module.exports);
  return module.exports;
}

const composer = (name) => ({ name, addAttachment() {}, focus: async () => {} });

/** A 0.16 client whose `composers(selector)` answers from a map; records what it was asked. */
function client({ byAgent = {}, focused = null } = {}) {
  const asked = [];
  return {
    asked,
    composers(selector) {
      assert.equal(this, client.self, "called on its client");
      asked.push(selector);
      if ("focused" in selector) return focused ? [focused] : [];
      return byAgent[selector.agentId] ? [byAgent[selector.agentId]] : [];
    },
  };
}

test("the attach target is the session /recall came from, chosen by selector, else the focused one", async () => {
  const { composerLookup, resolveAttachTarget } = await load();
  const from = composer("from"), focused = composer("focused");
  const host = client({ byAgent: { "agent-7": from }, focused });
  client.self = host;
  const lookup = composerLookup(host);

  const target = resolveAttachTarget(lookup, "agent-7", "Invoice retry backoff with a much longer title");
  assert.equal(target.composer, from);
  assert.equal(target.agentId, "agent-7");
  assert.deepEqual(target.selector, { agentId: "agent-7" }, "resolved by selector, never by reading an id off a composer");
  assert.equal(target.label, "Invoice retry backoff…", "the button names the session, cut at a word");
  assert.equal(resolveAttachTarget(lookup, "agent-7", undefined).label, "your session");

  const fallback = resolveAttachTarget(lookup, undefined, undefined);
  assert.equal(fallback.composer, focused);
  assert.equal(fallback.agentId, null);
  assert.equal(fallback.label, "this session");
  assert.equal(resolveAttachTarget(lookup, "agent-closed", "Closed").composer, focused, "a session with no composer falls back to the focused one");
});

test("no composer, a host before 0.16, or a host that throws: no attach action, and no crash", async () => {
  const { composerLookup, resolveAttachTarget } = await load();
  const empty = client(); client.self = empty;
  assert.equal(resolveAttachTarget(composerLookup(empty), "agent-7", "x"), null);
  assert.equal(composerLookup({}), null, "0.15 has no client.composers; Copy stays the only path");
  assert.equal(resolveAttachTarget(null, "agent-7", "x"), null);
  const broken = { composers() { throw new Error("useComposers must run inside a plugin component"); } };
  assert.equal(resolveAttachTarget(composerLookup(broken), "agent-7", "x"), null, "a host error hides the action instead of taking the screen down");
});

test("invariant: the search screen's code calls no host state or composer hooks", async () => {
  // On Paseo 0.16 a plugin screen has no provider for them: useAgent threw "Plugin state hooks must
  // run inside a plugin host" and blanked the screen. Host state reaches the screen through plain
  // client calls (client.composers) or screen params, which can be guarded.
  const offenders = [];
  for (const name of await readdir("client")) {
    if (!/\.tsx?$/.test(name)) continue;
    const source = await readFile(`client/${name}`, "utf8");
    for (const hook of source.match(/\buse(Composers?|Agents?|Workspaces?|Projects?|Terminals?)\s*\(/g) ?? []) offenders.push(`${name}: ${hook}`);
  }
  assert.deepEqual(offenders, []);
});
