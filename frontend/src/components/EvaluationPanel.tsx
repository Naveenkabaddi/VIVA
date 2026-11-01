import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Lightbulb,
  Sparkles,
  Target,
} from "lucide-react";
import type { Evaluation, SourceReference } from "../lib/types";
import { cn, formatNumber } from "../lib/utils";
import { Badge, Card } from "./UI";
import { ScoreRing } from "./ScoreRing";

const CRITERIA: Array<{ key: keyof Evaluation; label: string; weight: string }> = [
  { key: "technical_accuracy", label: "Technical accuracy", weight: "30%" },
  { key: "relevance", label: "Relevance", weight: "20%" },
  { key: "completeness", label: "Completeness", weight: "20%" },
  { key: "conceptual_understanding", label: "Conceptual understanding", weight: "20%" },
  { key: "clarity", label: "Explanation clarity", weight: "10%" },
];

function criterionColor(value: number): string {
  if (value >= 75) return "from-emerald-500 to-emerald-400";
  if (value >= 50) return "from-amber-500 to-amber-400";
  return "from-rose-500 to-rose-400";
}

function SourceList({ sources }: { sources: SourceReference[] }) {
  if (!sources.length) return null;
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <FileText className="h-3.5 w-3.5" /> Grounded sources
      </h4>
      <ul className="mt-2 space-y-2">
        {sources.slice(0, 4).map((source, index) => (
          <li
            key={`${source.chunk_id ?? index}`}
            className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{source.filename ?? "Project report"}</span>
              {source.page_number != null && <span>p.{source.page_number}</span>}
              {source.section && <Badge tone="slate">{source.section}</Badge>}
            </div>
            {source.snippet && (
              <p className="mt-1 line-clamp-2 leading-relaxed text-slate-500 dark:text-slate-400">
                {source.snippet}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvaluationPanel({
  evaluation,
  className,
  showReference = true,
}: {
  evaluation: Evaluation;
  className?: string;
  showReference?: boolean;
}) {
  const overallTone =
    evaluation.total_score >= 75 ? "emerald" : evaluation.total_score >= 50 ? "amber" : "rose";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-col gap-5 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center">
        <ScoreRing score={evaluation.total_score} size={120} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={overallTone}>
              {evaluation.total_score >= 75
                ? "Strong answer"
                : evaluation.total_score >= 50
                  ? "Partially correct"
                  : "Needs improvement"}
            </Badge>
            <Badge tone="slate">{evaluation.engine === "gemini" ? "Gemini evaluator" : "Offline evaluator"}</Badge>
            {evaluation.sufficient_context === false && <Badge tone="amber">Limited document context</Badge>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{evaluation.feedback}</p>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Target className="h-3.5 w-3.5" /> Criterion scores
            </h4>
            <div className="mt-3 space-y-3">
              {CRITERIA.map((criterion) => {
                const raw = evaluation[criterion.key];
                const value = typeof raw === "number" ? raw : 0;
                return (
                  <div key={criterion.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {criterion.label}
                        <span className="ml-1.5 text-slate-400">({criterion.weight})</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">{formatNumber(value)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn("h-full rounded-full bg-gradient-to-r transition-all", criterionColor(value))}
                        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {evaluation.strengths.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Strengths
              </h4>
              <ul className="mt-2 space-y-1.5">
                {evaluation.strengths.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.improvement_suggestions.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                <Lightbulb className="h-3.5 w-3.5" /> How to improve
              </h4>
              <ul className="mt-2 space-y-1.5">
                {evaluation.improvement_suggestions.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {evaluation.missing_concepts.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Missing concepts
              </h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {evaluation.missing_concepts.map((concept, index) => (
                  <Badge key={index} tone="amber">
                    {concept}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {evaluation.mistakes.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Mistakes spotted
              </h4>
              <ul className="mt-2 space-y-1.5">
                {evaluation.mistakes.map((item, index) => (
                  <li key={index} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showReference && evaluation.corrected_answer && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <BookOpen className="h-3.5 w-3.5" /> Model answer
              </h4>
              <p className="mt-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm leading-relaxed text-slate-700 dark:border-brand-500/20 dark:bg-brand-500/5 dark:text-slate-300">
                {evaluation.corrected_answer}
              </p>
            </div>
          )}

          <SourceList sources={evaluation.source_references} />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
        <Sparkles className="h-3.5 w-3.5" />
        Scores follow the platform formula: accuracy 30% · relevance 20% · completeness 20% · understanding 20% · clarity 10%.
      </div>
    </Card>
  );
}
