import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
const LAST_ACTIVITY_KEY = 'netpulse_last_activity';
const CHECK_INTERVAL_MS = 30 * 1000;
const WRITE_THROTTLE_MS = 5 * 1000;

const readLastActivity = () => {
  try {
    return Number(sessionStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastActivity = (ts) => {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // Ignore storage errors
  }
};

// Calls onIdle once no user activity has been seen for timeoutMs.
// The last-activity time lives in sessionStorage so a reload after a long idle still logs out,
// and the check runs on an interval + when the tab becomes visible (timers are throttled in background tabs).
export default function useIdleLogout(enabled, onIdle, timeoutMs) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return undefined;

    let lastWrite = 0;
    const markActive = () => {
      const now = Date.now();
      if (now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      writeLastActivity(now);
    };

    const check = () => {
      const last = readLastActivity();
      if (last && Date.now() - last >= timeoutMs) {
        try {
          sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        } catch {
          // Ignore storage errors
        }
        onIdleRef.current();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    // Check first so a reload after a long idle logs out instead of refreshing the timestamp
    check();
    if (!readLastActivity()) markActive();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [enabled, timeoutMs]);
}
