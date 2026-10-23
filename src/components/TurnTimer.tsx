import { useEffect, useState } from 'react';

interface Props {
  deadline: number;
  totalMs: number;
  serverNow: () => number;
  /** Diameter in px. */
  size?: number;
  showSeconds?: boolean;
}

/** Countdown ring that drains as the turn timer runs out. */
export function TurnTimer({ deadline, totalMs, serverNow, size = 22, showSeconds = true }: Props) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [serverNow]);

  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  const frac = Math.min(1, left / totalMs);
  // Deep enough to read on both the amber 'your turn' banner and the dark one.
  const color = secs <= 5 ? '#e11d48' : secs <= 10 ? '#ea580c' : 'currentColor';
  const r = 9;
  const c = 2 * Math.PI * r;

  return (
    <span className="inline-flex items-center gap-1" role="timer" aria-label={`${secs} seconds left`}>
      <svg width={size} height={size} viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      {showSeconds && (
        <span className="min-w-[2ch] text-sm font-bold tabular-nums" style={{ color }}>
          {secs}
        </span>
      )}
    </span>
  );
}
