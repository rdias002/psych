const COLORS = ['#f472b6', '#38bdf8', '#a3e635', '#fb923c', '#c084fc', '#facc15', '#2dd4bf', '#f87171', '#818cf8', '#4ade80', '#e879f9', '#fbbf24'];

/** A stable colour per player, from their position in the room. */
export const playerColor = (index: number) => COLORS[((index % COLORS.length) + COLORS.length) % COLORS.length];

interface Props {
  name: string;
  color: string;
  /** Diameter in px. */
  size?: number;
  dim?: boolean;
  /** Small badge in the corner, e.g. a tick once they've answered. */
  badge?: string;
}

/** Coloured circle with the player's initial. */
export function Avatar({ name, color, size = 32, dim = false, badge }: Props) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-black text-indigo-950 transition ${dim ? 'opacity-35' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.45 }}
      title={name}
      aria-label={name}
    >
      {[...name][0]?.toUpperCase() ?? '?'}
      {badge && (
        <span className="pop-in absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-emerald-400 text-[0.6rem] text-indigo-950 ring-2 ring-night">
          {badge}
        </span>
      )}
    </span>
  );
}
