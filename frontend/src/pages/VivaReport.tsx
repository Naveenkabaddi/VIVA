import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Lightbulb,
  Printer,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  ErrorBanner,
  PageHeader,
  ProgressBar,
  Spinner,
} from "../components/UI";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { ScoreRing } from "../components/ScoreRing";
import { DifficultyBadge, ReadinessBadge, ScorePill, SectionLabel, TickList } from "../components/Widgets";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { SessionDetail, SessionReport } from "../lib/types";
import { formatDate, formatDateTime, formatNumber } from "../lib/utils";
import { useToast } from "../context/ToastContext";

interface ReportPayload {
  report: SessionReport;
  session: SessionDetail;
}

export function VivaReport() {
  const params = useParams();
  const sessionId = Number(params.id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, loading, error, reload } = useApiResource<ReportPayload>(
    async () => {
      const [report, session] = await Promise.all([
        api.get<SessionReport>(`/viva/${sessionId}/report`).then((response) => response.data),
        api.get<SessionDetail>(`/viva/${sessionId}`).then((response) => response.data),
      ]);
      return { report, session };
    },
    [sessionId],
  );

  const turns = data?.report.turns ?? data?.session.turns ?? [];
  const answeredTurns = useMemo(() => turns.filter((turn) => turn.answer_id !== null), [turns]);
  const bestCategory = useMemo(
    () => [...(data?.report.category_breakdown ?? [])].sort((a, b) => b.average_score - a.average_score)[0],
    [data],
  );

  if (!Number.isFinite(sessionId)) return <ErrorBanner message="Invalid session id." />;
  if (loading && !data) return <Spinner label="Assembling your examiner report…" />;
  if (error && !data) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <div className="flex flex-wrap gap-2">
          <Link to={`/viva/${sessionId}`}>
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to session
            </Button>
          </Link>
          <Link to="/history">
            <Button variant="ghost">Session history</Button>
          </Link>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { report, session } = data;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ report, session }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `viva-report-${sessionId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Report downloaded as JSON.", "success");
  };

  const removeSession = async () => {
    if (!window.confirm("Delete this session, its answers, evaluations and report? This cannot be undone.")) return;
    try {
      await api.delete(`/viva/${sessionId}`);
      toast("Session deleted.", "success");
      navigate("/history", { replace: true });
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/history"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-600 dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Session history
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportJson}>
            JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-500 hover:text-rose-600"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={removeSession}
          >
            Delete
          </Button>
        </div>
      </div>

      <PageHeader
        eyebrow="Examiner report"
        title={session.project_title ?? "Mock viva report"}
        description={`${session.difficulty} difficulty · ${session.mode} mode · completed ${formatDateTime(session.completed_at)}`}
        actions={
          <>
            <Link to={`/viva/new?project=${session.project_id}`}>
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />}>
                Retake viva
              </Button>
            </Link>
            <Link to="/recommendations">
              <Button icon={<Lightbulb className="h-4 w-4" />}>My plan</Button>
            </Link>
          </>
        }
      />

      <Card className="overflow-hidden print:border-0 print:shadow-none">
        <div className="flex flex-col gap-6 border-b border-slate-200 bg-gradient-to-r from-brand-50 via-white to-violet-50 p-6 dark:border-slate-800 dark:from-brand-500/10 dark:via-slate-900 dark:to-violet-500/10 sm:flex-row sm:items-center">
          <ScoreRing score={report.overall_score} size={142} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ReadinessBadge readiness={report.readiness} />
              <Badge tone={report.engine === "gemini" ? "violet" : "emerald"}>
                {report.engine === "gemini" ? "Gemini report" : "Offline report"}
              </Badge>
              <DifficultyBadge difficulty={session.difficulty} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{report.summary}</p>
            <p className="mt-2 text-[11px] text-slate-400">Generated {formatDate(report.created_at)}</p>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <Target className="h-3 w-3" /> Answers evaluated
            </p>
            <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
              {answeredTurns.length}
              <span className="text-xs font-semibold text-slate-400"> / {turns.length} questions</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <Clock className="h-3 w-3" /> Time spent
            </p>
            <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
              {formatNumber(session.elapsed_minutes ?? 0, 0)}
              <span className="text-xs font-semibold text-slate-400"> min</span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <Trophy className="h-3 w-3" /> Best category
            </p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">
              {bestCategory?.category ?? "—"}
            </p>
            <p className="text-[10px] text-slate-400">
              {bestCategory ? `${formatNumber(bestCategory.average_score)}/100` : "No scored answers"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <TrendingUp className="h-3 w-3" /> Readiness
            </p>
            <p className="mt-1 text-sm font-bold capitalize text-slate-900 dark:text-white">
              {report.readiness?.replace("_", " ") ?? "Not assessed"}
            </p>
            <p className="text-[10px] text-slate-400">Based on stored evaluations</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Strengths" description="What the examiner found convincing." />
          <div className="p-5 pt-3">
            {report.strengths.length ? (
              <TickList items={report.strengths} tone="emerald" />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No clear strengths were recorded. Complete more questions to build evidence.
              </p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Weaknesses" description="Where marks were lost." />
          <div className="p-5 pt-3">
            {report.weaknesses.length ? (
              <TickList items={report.weaknesses} tone="rose" />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No weakness thresholds were crossed in this session.
              </p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Improvement plan" description="Targeted actions before your real viva." />
          <div className="p-5 pt-3">
            {report.improvement_plan.length ? (
              <TickList items={report.improvement_plan} tone="brand" />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No specific actions were generated.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader title="Category breakdown" description="Average score and verdict per viva category." />
          <div className="space-y-3 p-5">
            {report.category_breakdown.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No scored categories in this session.</p>
            )}
            {report.category_breakdown.map((item) => (
              <div key={item.category}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.category}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={item.verdict === "strong" ? "emerald" : item.verdict === "weak" ? "rose" : "amber"}>
                      {item.verdict}
                    </Badge>
                    <span className="font-bold text-slate-900 dark:text-white">{formatNumber(item.average_score)}</span>
                  </span>
                </div>
                <ProgressBar value={item.average_score} />
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionLabel icon={<GraduationCap className="h-3.5 w-3.5" />}>Examiner's remarks</SectionLabel>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {report.examiner_remarks ||
                "Connect every claim to evidence in your report. Structure answers as definition, mechanism, project example and limitation."}
            </p>
            <Divider className="my-4" />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="subtle"
                icon={<Lightbulb className="h-3.5 w-3.5" />}
                onClick={() => navigate("/recommendations")}
              >
                Open recommendations
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                onClick={() => navigate(`/viva/new?project=${session.project_id}`)}
              >
                Retake
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel icon={<BookOpen className="h-3.5 w-3.5" />}>How scoring works</SectionLabel>
            <div className="mt-3 space-y-2">
              {[
                { label: "Technical accuracy", weight: 30 },
                { label: "Relevance", weight: 20 },
                { label: "Completeness", weight: 20 },
                { label: "Conceptual understanding", weight: 20 },
                { label: "Clarity", weight: 10 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>{item.label}</span>
                  <span className="font-bold">{item.weight}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              The total is recomputed from these weights. Empty, vague or extremely short answers are capped.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title={`Question review (${turns.length})`}
          description="Expand any question to see the evidence, model answer and criterion-level feedback."
          action={
            <Badge tone="slate">
              <FileText className="h-3 w-3" /> {answeredTurns.length} evaluated
            </Badge>
          }
        />
        <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
          {turns.length === 0 && <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400">No questions recorded.</p>}
          {turns.map((turn, index) => (
            <details key={turn.question_id} className="group px-5 py-4" open={index === 0}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-white">{turn.question}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                      <span>{turn.category}</span>
                      <span>· {turn.difficulty}</span>
                      {turn.is_followup && <span>· follow-up</span>}
                      {turn.input_type && <span>· {turn.input_type}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {turn.score !== null ? <ScorePill score={turn.score} /> : <Badge tone="slate">not answered</Badge>}
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
                </div>
              </summary>

              <div className="mt-4 space-y-4 pl-9">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <CheckCircle2 className="h-3 w-3" /> Your answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {turn.answer_text ?? "No answer was submitted for this question."}
                  </p>
                </div>
                {turn.evaluation ? (
                  <EvaluationPanel evaluation={turn.evaluation} />
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This question was not evaluated because no answer was submitted.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 print:hidden">
        <span>Report generated from {answeredTurns.length} stored evaluation(s). No fabricated evidence.</span>
        <Link to="/history" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Back to all sessions
        </Link>
      </div>
    </div>
  );
}
