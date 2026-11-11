import type { PluginAttachmentItem } from "@getpaseo/plugin";

/**
 * The composer the search preview's "Attach to <session>" action fills, on Paseo 0.16.
 *
 * A `PluginComposer` is not told which agent it belongs to, so the target is chosen by selector and
 * never by reading an id back: the session `/recall` was typed in (the screen's `from` param), else
 * the focused session. Neither resolving, or a host without `client.composers` (0.15 and older),
 * leaves no target, and the action is not drawn.
 *
 * This goes through `client.composers(selector)`, a plain call, and not the host's React hooks:
 * on Paseo 0.16 a plugin screen has no provider for `useComposers` / `useAgent`, and they throw
 * ("Plugin state hooks must run inside a plugin host"), which took the whole screen down. A plain
 * call can be guarded; a throwing hook cannot.
 */

/** The `addAttachmentSource` id the composer "+" menu registers; the pill is the same either way. */
export const ATTACH_SOURCE_ID = "past-conversation";

/** The slice of 0.16's `PluginComposer` the action uses. */
export interface AttachComposer {
  addAttachment(input: { sourceId: string; item: PluginAttachmentItem }): void;
  removeAttachment?(input: { sourceId: string; itemId: string }): void;
  focus(): Promise<void>;
}

export type ComposerSelector = { agentId: string } | { focused: true };
/** `client.composers`, when this host has it. */
export type ComposerLookup = (selector: ComposerSelector) => readonly AttachComposer[];

export interface AttachTarget {
  /** Resolves the composer again at press time, so the live one gets the item. */
  selector: ComposerSelector;
  composer: AttachComposer;
  /** The session the button names; null for the focused session. */
  agentId: string | null;
  label: string;
}

/** `client.composers` bound to its client, or null on a host before Paseo 0.16. */
export function composerLookup(client: unknown): ComposerLookup | null {
  const composers = (client as { composers?: unknown } | null)?.composers;
  if (typeof composers !== "function") return null;
  return (selector) => composers.call(client, selector) as readonly AttachComposer[];
}

/** The first composer `selector` names; a host error counts as none, never as a crash. */
export function firstComposer(lookup: ComposerLookup, selector: ComposerSelector): AttachComposer | null {
  try {
    const found = lookup(selector);
    return Array.isArray(found) && found.length > 0 ? found[0]! : null;
  } catch {
    return null;
  }
}

/**
 * A session title short enough for a button that shares a row with Open, Copy and Workspace in a
 * 600px preview pane: cut at a word boundary when one is near, so it reads "Refund flow…".
 */
export function shortTitle(title: string, limit = 24): string {
  const flat = title.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const FOCUSED: ComposerSelector = { focused: true };

export function resolveAttachTarget(lookup: ComposerLookup | null, from: string | undefined, fromTitle: string | undefined): AttachTarget | null {
  if (!lookup) return null;
  const agentId = from?.trim() ?? "";
  if (agentId) {
    const selector = { agentId };
    const composer = firstComposer(lookup, selector);
    if (composer) return { selector, composer, agentId, label: fromTitle?.trim() ? shortTitle(fromTitle) : "your session" };
  }
  const focused = firstComposer(lookup, FOCUSED);
  return focused ? { selector: FOCUSED, composer: focused, agentId: null, label: "this session" } : null;
}

/**
 * A failed attach in words a person can act on, without the transport's request details. A host
 * whose Transcript Search predates the attach RPC answers "Plugin transcript-search does not
 * contribute RPC transcript-search.attach-item" (seen in the 0.16 harness).
 */
export function attachError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/does not contribute RPC|unknown (rpc|handler|method)|not registered|no handler|handler_not_found|unknown_rpc/i.test(raw)) return "That host can't attach yet. Update Transcript Search there, or copy the excerpt.";
  const message = raw.replace(/^Request failed:\s*/i, "").replace(/\s+requestType=\S+.*$/, "").trim();
  return message ? `Couldn't attach: ${message}` : "Couldn't attach this conversation. Copy the excerpt instead.";
}
