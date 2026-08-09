import { useEffect } from 'react';

export interface HotkeyActions {
  onNext?: () => void;
  onPrev?: () => void;
  onToggleWatched?: () => void;
  onHide?: () => void;
  onFocusSearch?: () => void;
}

/**
 * Custom React hook for Yutupe power-user keyboard shortcuts.
 * Automatically avoids triggering when the user is typing in input/textarea/select fields.
 */
export function useYutupeHotkeys(enabled: boolean, actions: HotkeyActions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if (isInput) {
        // Stop event propagation to prevent YouTube background player from triggering (e.g., 'k' pause, 'f' fullscreen)
        event.stopPropagation();
        return;
      }

      // Hotkey handling
      const key = event.key.toLowerCase();

      if (key === 'j' || (event.key === 'ArrowDown' && event.altKey)) {
        event.preventDefault();
        actions.onNext?.();
      } else if (key === 'k' || (event.key === 'ArrowUp' && event.altKey)) {
        event.preventDefault();
        actions.onPrev?.();
      } else if (key === 'w' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        actions.onToggleWatched?.();
      } else if (key === 'h' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        actions.onHide?.();
      } else if (key === '/' || (key === 'c' && event.shiftKey)) {
        event.preventDefault();
        actions.onFocusSearch?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, actions]);
}
