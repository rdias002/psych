import { useCallback, useEffect, useState } from 'react';

/** Copy text to the clipboard; `copied` stays true for a moment afterwards. */
export function useCopy(): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  return [copied, copy];
}
