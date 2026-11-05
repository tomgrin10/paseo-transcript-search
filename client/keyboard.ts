import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/** The slice of the DOM this plugin touches; the project compiles without the DOM library. */
interface KeyEventLike {
  key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; defaultPrevented: boolean;
  target: unknown; preventDefault(): void;
}
interface ElementLike { isContentEditable?: boolean; tagName?: string; closest?(selector: string): unknown }
interface DocumentLike {
  addEventListener(type: "keydown", listener: (event: KeyEventLike) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyEventLike) => void): void;
}

export type ScreenKey = "down" | "up" | "enter" | "slash";

function isEditable(target: unknown): boolean {
  const element = target as ElementLike | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName ?? "")));
}

/**
 * Web keyboard for a screen: "/" from anywhere that is not a text field, and ↑ ↓ Enter while focus
 * sits inside the screen's root (`nativeID`). Keys with modifiers are left to the app. The field
 * itself handles its own keys, so events from `ignore()` are skipped.
 */
export function useScreenKeys(rootId: string, ignore: () => unknown, onKey: (key: ScreenKey) => boolean) {
  const latest = useRef(onKey);
  latest.current = onKey;
  useEffect(() => {
    const doc = (globalThis as { document?: DocumentLike }).document;
    if (Platform.OS !== "web" || !doc) return;
    const handler = (event: KeyEventLike) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target === ignore()) return;
      const editable = isEditable(event.target);
      if (event.key === "/" && !editable) { if (latest.current("slash")) event.preventDefault(); return; }
      const inside = (event.target as ElementLike | null)?.closest?.(`#${rootId}`);
      if (editable || !inside) return;
      const key: ScreenKey | null = event.key === "ArrowDown" ? "down" : event.key === "ArrowUp" ? "up" : event.key === "Enter" ? "enter" : null;
      if (key && latest.current(key)) event.preventDefault();
    };
    doc.addEventListener("keydown", handler);
    return () => doc.removeEventListener("keydown", handler);
  }, [rootId, ignore]);
}
