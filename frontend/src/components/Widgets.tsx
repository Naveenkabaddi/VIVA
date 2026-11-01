import type { ReactNode } from "react";
import { Badge } from "./UI";
import { cn, formatNumber, scoreClasses } from "../lib/utils";

export function ScorePill({
  score,
  className,
  suffix = "/100",
}: {
  score: number | null | undefined;
  className?: string;
  suffix?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-lg px-2 py-0.5 text-sm font-extrabold ring-1 ring-inset",
        score === null || score === undefined
          ? "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
          : score >= 75
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
            : score >= 50
              ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
              : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
        className,
      )}
    >
      {formatNumber(score)}
      <span className="text-[10px] font-semibold opacity-60">{suffix}</span>
    </span>
  );
}

export function ScoreText({ score, className }: { score: number | null | undefined; className?: string }) {
  return <span className={cn("font-extrabold", scoreClasses(score), className)}>{formatNumber(score)}</span>;
}

const SESSION_STATUS_TONES: Record<string, "emerald" | "amber" | "slate" | "brand" | "rose"> = {
  active: "emerald",
  paused: "amber",
  completed: "brand",
  abandoned: "rose",
};

export function SessionStatusBadge({ status }: { status: string }) {
  return <Badge tone={SESSION_STATUS_TONES[status] ?? "slate"}>{status}</Badge>;
}

const DIFFICULTY_TONES: Record<string, "emerald" | "amber" | "rose" | "violet" | "slate"> = {
  basic: "emerald",
  intermediate: "amber",
  advanced: "rose",
  mixed: "violet",
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge tone={DIFFICULTY_TONES[difficulty] ?? "slate"}>{difficulty}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === "high" ? "rose" : priority === "medium" ? "amber" : "slate";
  return <Badge tone={tone}>{priority}</Badge>;
}

export function DocumentStatusBadge({ status }: { status: string }) {
  const tone =
    status === "ready"
      ? "emerald"
      : status === "failed"
        ? "rose"
        : status === "processing"
          ? "sky"
          : "amber";
  return (
    <Badge tone={tone}>
      {status === "processing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status}
    </Badge>
  );
}

export function TopicChips({
  topics,
  empty = "None yet",
  max = 8,
}: {
  topics: string[];
  empty?: string;
  max?: number;
}) {
  if (!topics.length) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.slice(0, max).map((topic, index) => (
        <span
          key={`${topic}-${index}`}
          className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {topic}
        </span>
      ))}
    </div>
  );
}

export function SectionLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {icon}
      {children}
    </h3>
  );
}

export function TickList({
  items,
  tone = "brand",
}: {
  items: string[];
  tone?: "brand" | "emerald" | "rose" | "amber";
}) {
  const dot: Record<string, string> = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
  };
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot[tone])} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ReadinessBadge({ readiness }: { readiness?: string | null }) {
  if (!readiness) return null;
  const map: Record<string, { tone: "emerald" | "amber" | "rose"; label: string }> = {
    ready: { tone: "emerald", label: "Viva ready" },
    nearly_ready: { tone: "amber", label: "Nearly ready" },
    needs_practice: { tone: "rose", label: "Needs practice" },
  };
  const value = map[readiness] ?? { tone: "slate" as const, label: readiness };
  return <Badge tone={value.tone}>{value.label}</Badge>;
}
