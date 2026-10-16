import { useEffect } from "react";

/**
 * Ctrl+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo (Cmd on Mac). Skipped while typing in a text
 * field, so Ctrl+Z still undoes text in the Join box.
 */
export function useUndoShortcuts(onUndo: () => void, onRedo: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLInputElement && target.type === "text") return;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onUndo, onRedo]);
}
