import { useEffect, useRef } from 'react';

/**
 * While `active`, intercept browser/phone back (via a sentinel history entry) and
 * refresh/close (via beforeunload). `onBack` is called instead of leaving.
 * Returns `release()`, to call right before deliberately leaving.
 */
export function useLeaveGuard(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const released = useRef(false);

  useEffect(() => {
    if (!active) return;
    released.current = false;
    // Guard entry at the same URL; pressing back pops it instead of leaving.
    if (!history.state?.guard) history.pushState({ guard: true }, '');

    const onPop = () => {
      if (released.current) return;
      history.pushState({ guard: true }, '');
      onBackRef.current();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (released.current) return;
      e.preventDefault();
    };
    addEventListener('popstate', onPop);
    addEventListener('beforeunload', onUnload);
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('beforeunload', onUnload);
    };
  }, [active]);

  return () => {
    released.current = true;
  };
}
