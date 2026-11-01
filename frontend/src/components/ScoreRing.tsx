import { scoreTone } from "../lib/utils";

export function ScoreRing({
  score,
  size = 132,
  stroke = 10,
  label,
}: {
  score: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const safe = Math.max(0, Math.min(100, score ?? 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const tone = scoreTone(score);
  const colors: Record<string, { start: string; end: string; text: string }> = {
    strong: { start: "#10b981", end: "#34d399", text: "text-emerald-600 dark:text-emerald-400" },
    average: { start: "#f59e0b", end: "#fbbf24", text: "text-amber-600 dark:text-amber-400" },
    weak: { start: "#f43f5e", end: "#fb7185", text: "text-rose-600 dark:text-rose-400" },
    empty: { start: "#94a3b8", end: "#cbd5e1", text: "text-slate-400" },
  };
  const color = colors[tone];
  const gradientId = `score-gradient-${tone}-${size}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color.start} />
            <stop offset="100%" stopColor={color.end} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-extrabold tracking-tight ${color.text}`} style={{ fontSize: size / 4 }}>
          {score === null || score === undefined ? "—" : Math.round(score)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label ?? "out of 100"}
        </span>
      </div>
    </div>
  );
}
