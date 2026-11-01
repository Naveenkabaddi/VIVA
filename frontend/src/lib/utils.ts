export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, options ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "—";
  const seconds = Math.round((date - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor || unit === "second") {
      return formatter.format(Math.round(seconds / divisor), unit);
    }
  }
  return "just now";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits).replace(/\.0$/, "");
}

export function scoreTone(score: number | null | undefined): "strong" | "average" | "weak" | "empty" {
  if (score === null || score === undefined) return "empty";
  if (score >= 75) return "strong";
  if (score >= 50) return "average";
  return "weak";
}

export function scoreClasses(score: number | null | undefined): string {
  const tone = scoreTone(score);
  if (tone === "strong") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "average") return "text-amber-600 dark:text-amber-400";
  if (tone === "weak") return "text-rose-600 dark:text-rose-400";
  return "text-slate-400";
}

export function scoreBadgeClasses(score: number | null | undefined): string {
  const tone = scoreTone(score);
  if (tone === "strong") return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30";
  if (tone === "average") return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30";
  if (tone === "weak") return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30";
  return "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700";
}

export function truncateText(text: string, length = 160): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

export const DIFFICULTY_OPTIONS = ["basic", "intermediate", "advanced", "mixed"] as const;

export const CATEGORIES = [
  "Project Introduction",
  "Problem Statement",
  "Objectives",
  "Literature Review",
  "Technical Concepts",
  "Algorithms and Models",
  "System Architecture",
  "Implementation",
  "Database Design",
  "Testing",
  "Results",
  "Real-World Applications",
  "Limitations",
  "Future Scope",
] as const;
