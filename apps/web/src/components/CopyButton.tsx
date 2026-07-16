import { useEffect, useRef, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clear a pending reset if the button unmounts (e.g. the basket is deleted
  // right after a copy) so we don't setState on a gone component.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // Denied, insecure context, or unfocused document: tell the user
      // instead of failing silently with an unhandled rejection.
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }

  return (
    <button className="ghost" onClick={onCopy}>
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
