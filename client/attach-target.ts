import * as clientApi from "@getpaseo/plugin/client";
import type { PluginAttachmentItem } from "@getpaseo/plugin";
import { useMemo } from "react";

/**
 * The composer the search preview's "Attach to <session>" action fills, on Paseo 0.16.
 *
 * A `PluginComposer` is not told which agent it belongs to, so the target is chosen by selector and
 * never by reading an id back: the session `/recall` was typed in (the screen's `from` param), else
 * the focused session. Neither resolving, or a host without `useComposers` (0.15 and older), leaves
 * no target, and the action is not drawn.
 */

/** The `addAttachmentSource` id the composer "+" menu registers; the pill is the same either way. */
export const ATTACH_SOURCE_ID = "past-conversation";

/** The slice of 0.16's `PluginComposer` the action uses. */
export interface AttachComposer {
  addAttachment(input: { sourceId: string; item: PluginAttachmentItem }): void;
  removeAttachment?(input: { sourceId: string; itemId: string }): void;
  focus(): Promise<void>;
}

type Selector = { agentId: string } | { focused: true };

/** 0.16-only export, read off the module so the 0.14 typings still compile. */
const useComposersOnHost = (clientApi as unknown as { useComposers?: (selector: Selector) => readonly AttachComposer[] }).useComposers;
const useAgentOnHost = (clientApi as unknown as { useAgent?: <T>(agentId: string, select: (agent: { title: string | null }) => T) => T | null }).useAgent;

export interface AttachTarget {
  composer: AttachComposer;
  /** The session the button names; null for the focused session, whose agent is not known. */
  agentId: string | null;
  label: string;
}

const NO_COMPOSERS: readonly AttachComposer[] = [];
const FOCUSED: Selector = { focused: true };
const NONE = () => NO_COMPOSERS;
const NO_TITLE = () => null;

/** A session title short enough for a button. */
export function shortTitle(title: string, limit = 28): string {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/** Whether this host can attach to a composer at all (Paseo 0.16+). */
export const canAttachToComposer = typeof useComposersOnHost === "function";

export function useAttachTarget(fromAgentId: string | undefined): AttachTarget | null {
  // The hooks are fixed per host build, so the calls stay in the same order on every render.
  const useComposers = useComposersOnHost ?? NONE;
  const useAgent = useAgentOnHost ?? NO_TITLE;
  const from = fromAgentId?.trim() || "";
  const fromSelector = useMemo<Selector>(() => (from ? { agentId: from } : FOCUSED), [from]);
  const fromComposer = useComposers(fromSelector)[0];
  const focusedComposer = useComposers(FOCUSED)[0];
  const title = useAgent(from || "\u0000", (agent) => agent.title);
  return useMemo(() => {
    if (from && fromComposer) return { composer: fromComposer, agentId: from, label: title?.trim() ? shortTitle(title) : "your session" };
    if (focusedComposer) return { composer: focusedComposer, agentId: null, label: "this session" };
    return null;
  }, [focusedComposer, from, fromComposer, title]);
}
