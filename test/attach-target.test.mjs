import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

/** Loads client/attach-target.ts against a stub host: `client` is what `@getpaseo/plugin/client` exports. */
async function load(client) {
  const built = await build({ entryPoints: ["client/attach-target.ts"], bundle: true, write: false, platform: "neutral", format: "cjs", external: ["react", "@getpaseo/plugin", "@getpaseo/plugin/client"] });
  const modules = { react: { useMemo: (fn) => fn() }, "@getpaseo/plugin": {}, "@getpaseo/plugin/client": client };
  const module = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)((id) => modules[id], module, module.exports);
  return module.exports;
}

const composer = (name) => ({ name, addAttachment() {}, focus: async () => {} });

/** A 0.16 host: `composers` maps a selector to what it resolves, `titles` agent ids to titles. */
function host({ byAgent = {}, focused = null, titles = {} } = {}) {
  const asked = [];
  return {
    asked,
    client: {
      useComposers(selector) {
        asked.push(selector);
        if ("focused" in selector) return focused ? [focused] : [];
        return byAgent[selector.agentId] ? [byAgent[selector.agentId]] : [];
      },
      useAgent: (id, select) => (id in titles ? select({ title: titles[id] }) : null),
    },
  };
}

test("the attach target is the session /recall came from, chosen by selector, else the focused one", async () => {
  const from = composer("from"), focused = composer("focused");
  const h = host({ byAgent: { "agent-7": from }, focused, titles: { "agent-7": "Invoice retry backoff with a much longer title" } });
  const { useAttachTarget, canAttachToComposer } = await load(h.client);
  assert.equal(canAttachToComposer, true);

  const target = useAttachTarget("agent-7");
  assert.equal(target.composer, from);
  assert.equal(target.agentId, "agent-7");
  assert.equal(target.label, "Invoice retry backoff with…", "the button names the session, cut short");
  assert.deepEqual(h.asked[0], { agentId: "agent-7" }, "resolved by agentId selector, never by reading an id off a composer");

  const fallback = useAttachTarget(undefined);
  assert.equal(fallback.composer, focused);
  assert.equal(fallback.agentId, null);
  assert.equal(fallback.label, "this session");

  const gone = useAttachTarget("agent-closed");
  assert.equal(gone.composer, focused, "a session that no longer has a composer falls back to the focused one");
});

test("no composer to fill, or a host before 0.16, draws no attach action", async () => {
  const none = await load(host().client);
  assert.equal(none.useAttachTarget("agent-7"), null);
  assert.equal(none.useAttachTarget(undefined), null);

  const old = await load({ useAgent: () => null });
  assert.equal(old.canAttachToComposer, false);
  assert.equal(old.useAttachTarget("agent-7"), null, "0.15 keeps Copy as its only path");
});
