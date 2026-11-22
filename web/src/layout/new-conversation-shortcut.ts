import { useEffect } from 'react';
import { useNavigate } from 'react-router';

function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** How the shortcut is written for this platform (keyboard hint, tooltips). */
export function newConversationShortcutLabel(): string {
  return isApplePlatform() ? '⌘⇧O' : 'Ctrl+Maj+O';
}

/** Value of `aria-keyshortcuts` for the controls that start a new conversation. */
export const NEW_CONVERSATION_ARIA_SHORTCUTS = 'Control+Shift+O Meta+Shift+O';

/**
 * Ctrl+Shift+O (⌘⇧O on a Mac) opens a new conversation from anywhere in the app, like the
 * "Nouvelle conversation" button. Either modifier is accepted on every platform.
 */
export function useNewConversationShortcut(onTrigger?: () => void): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || !event.shiftKey || event.altKey || event.key.toLowerCase() !== 'o') return;
      event.preventDefault();
      onTrigger?.();
      // A new history entry each time: the home page re-mounts and focuses its composer, even
      // when it is already open.
      void navigate('/', { state: { newConversation: Date.now() } });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate, onTrigger]);
}
