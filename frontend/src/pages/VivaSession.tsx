import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  ListChecks,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  ErrorBanner,
  ProgressBar,
  Spinner,
  Textarea,
} from "../components/UI";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { ScoreRing } from "../components/ScoreRing";
import { DifficultyBadge, ScorePill, SessionStatusBadge } from "../components/Widgets";
import { SpeakButton, VoiceRecorder } from "../components/VoiceRecorder";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type {
  AnswerResult,
  Evaluation,
  Question,
  SessionDetail,
  SessionSummary,
  SourceReference,
} from "../lib/types";
import { cn } from "../lib/utils";
import { useToast } from "../context/ToastContext";

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function SourceNote({ source }: { source?: SourceReference }) {
  if (!source || (!source.filename && !source.snippet && !source.section)) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <FileText className="h-3 w-3" /> Grounded in your report
      </p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        {source.filename ?? "Project report"}
        {source.page_number != null && ` · page ${source.page_number}`}
        {source.section && ` · ${source.section}`}
      </p>
      {source.snippet && (
        <p className="mt-1 line-clamp-2 text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400">
          “{source.snippet}”
        </p>
      )}
    </div>
  );
}

interface FeedbackState {
  evaluation: Evaluation;
  meta: AnswerResult["evaluation_meta"];
  followup: boolean;
}

export function VivaSession() {
  const params = useParams();
  const sessionId = Number(params.id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, loading, error, reload } = useApiResource<SessionDetail>(
    () => api.get<SessionDetail>(`/viva/${sessionId}`).then((response) => response.data),
    [sessionId],
  );

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [answer, setAnswer] = useState("");
  const [inputType, setInputType] = useState<"text" | "voice">("text");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [completed, setCompleted] = useState(false);
  const [actionLoading, setActionLoading] = useState<"pause" | "resume" | "end" | null>(null);
  const [actionError, setActionError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const sessionState = session ?? data ?? null;

  useEffect(() => {
    if (!data || hydrated) return;
    setSession(data);
    setQuestion(data.current_question ?? null);
    setCompleted(data.status === "completed");
    setHydrated(true);
  }, [data, hydrated]);

  const status = sessionState?.status ?? "active";

  useEffect(() => {
    if (!sessionState) return;
    setElapsed(Math.max(0, Math.round((sessionState.elapsed_minutes ?? 0) * 60)));
    // Reset only when the server reports a new elapsed value (after reload/answer).
  }, [sessionState?.elapsed_minutes, sessionState?.id]);

  useEffect(() => {
    if (status !== "active") return;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const durationSeconds = (sessionState?.duration_minutes ?? 20) * 60;
  const remaining = durationSeconds - elapsed;
  const timeUp = remaining <= 0;

  const answeredTurns = useMemo(
    () => (data?.turns ?? []).filter((turn) => turn.answer_id !== null),
    [data],
  );

  const totalQuestions = Math.max(sessionState?.total_questions ?? sessionState?.question_count ?? 0, 1);
  const answeredCount = sessionState?.answered_count ?? answeredTurns.length;
  const progress = completed ? 100 : (answeredCount / totalQuestions) * 100;

  const submit = async () => {
    if (!answer.trim()) {
      toast("Write or dictate an answer before submitting.", "error");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const { data: result } = await api.post<AnswerResult>(`/viva/${sessionId}/answer`, {
        answer_text: answer.trim(),
        input_type: inputType,
      });
      setSession(result.session);
      if (result.evaluation) {
        setFeedback({
          evaluation: result.evaluation,
          meta: result.evaluation_meta ?? null,
          followup: result.followup_generated,
        });
      }
      setQuestion(result.next_question ?? null);
      setCompleted(result.completed);
      setAnswer("");
      setInputType("text");
      void reload();
      if (result.completed && !result.evaluation) {
        navigate(`/viva/${sessionId}/report`, { replace: true });
      } else if (result.completed) {
        toast("Viva complete. Your examiner report is ready.", "success");
      }
    } catch (err) {
      const message = apiErrorMessage(err);
      setActionError(message);
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const continueViva = async () => {
    setFeedback(null);
    setAnswer("");
    setInputType("text");
    if (question) {
      void reload();
      return;
    }
    try {
      const { data: next } = await api.get<{
        completed: boolean;
        next_question: Question | null;
      }>(`/viva/${sessionId}/next-question`);
      setQuestion(next.next_question ?? null);
      if (next.completed) setCompleted(true);
      void reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    }
  };

  const pauseOrResume = async () => {
    const nextAction = status === "paused" ? "resume" : "pause";
    setActionLoading(nextAction);
    setActionError("");
    try {
      const { data: updated } = await api.post<SessionSummary>(
        `/viva/${sessionId}/${nextAction === "pause" ? "pause" : "resume"}`,
      );
      setSession(updated);
      setQuestion(updated.current_question ?? question);
      toast(nextAction === "pause" ? "Session paused. Your progress is saved." : "Session resumed.", "success");
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const endSession = async () => {
    if (!window.confirm("End this viva now? A report will be generated from the answers you have submitted.")) return;
    setActionLoading("end");
    setActionError("");
    try {
      await api.post(`/viva/${sessionId}/end`);
      navigate(`/viva/${sessionId}/report`, { replace: true });
    } catch (err) {
      setActionError(apiErrorMessage(err));
      setActionLoading(null);
    }
  };

  if (!Number.isFinite(sessionId)) return <ErrorBanner message="Invalid session id." />;
  if (loading && !data) return <Spinner label="Preparing the examination room…" />;
  if (error && !data) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <Link to="/history">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to history
          </Button>
        </Link>
      </div>
    );
  }
  if (!data || !sessionState) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/history"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-600 dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Session history
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <SessionStatusBadge status={status} />
          <DifficultyBadge difficulty={sessionState.difficulty} />
          <Badge tone="slate">
            <Mic className="h-3 w-3" /> {sessionState.mode}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</p>
          <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">
            {sessionState.project_title ?? "Project"}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time remaining</p>
            <Clock className={cn("h-3.5 w-3.5", timeUp ? "text-rose-500" : "text-slate-400")} />
          </div>
          <p className={cn("mt-1 text-sm font-extrabold", timeUp ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white")}>
            {formatClock(Math.abs(remaining))}
            {timeUp && <span className="ml-1 text-[10px] font-semibold uppercase">over</span>}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progress</p>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={progress} />
          </div>
        </Card>
      </div>

      {(actionError || error) && (
        <ErrorBanner message={actionError || error} onRetry={error ? reload : undefined} />
      )}

      {status === "completed" || completed ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-brand-50 p-6 text-center dark:border-slate-800 dark:from-emerald-500/10 dark:to-brand-500/10 sm:flex-row sm:text-left">
            <ScoreRing score={sessionState.overall_score} size={120} />
            <div className="flex-1">
              <Badge tone="emerald">
                <CheckCircle2 className="h-3 w-3" /> Viva completed
              </Badge>
              <h2 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">Your examiner report is ready</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {answeredTurns.length > 0
                  ? `${answeredTurns.length} answer${answeredTurns.length === 1 ? "" : "s"} were evaluated. Review your criterion scores, category strengths, weaknesses and improvement plan.`
                  : "This session ended without evaluated answers, so no performance judgement can be made."}
              </p>
            </div>
            <Link to={`/viva/${sessionId}/report`}>
              <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                Open report
              </Button>
            </Link>
          </div>
          {feedback?.evaluation && (
            <div className="p-5">
              <EvaluationPanel evaluation={feedback.evaluation} />
            </div>
          )}
        </Card>
      ) : feedback ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <MessageSquare className="h-3.5 w-3.5" /> Your answer
              </p>
              <Badge tone="slate">{feedback.meta?.category ?? "Answer"}</Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {feedback.meta?.answer_text ?? "Answer submitted."}
            </p>
            {feedback.meta?.source_reference && <SourceNote source={feedback.meta.source_reference} />}
          </Card>

          <EvaluationPanel evaluation={feedback.evaluation} />

          {feedback.followup && (
            <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              The examiner has prepared an adaptive follow-up based on this answer.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/dashboard">
              <Button variant="ghost">Back to dashboard</Button>
            </Link>
            <Button size="lg" icon={<ArrowRight className="h-4 w-4" />} onClick={continueViva}>
              {question ? "Continue to next question" : "Check for next question"}
            </Button>
          </div>
        </div>
      ) : status === "paused" ? (
        <Card className="p-8 text-center">
          <span className="mx-auto inline-flex rounded-2xl bg-amber-50 p-4 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Pause className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-slate-900 dark:text-white">Session paused</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Your progress is saved. Resume when you are ready to face the examiner again.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              size="lg"
              icon={<Play className="h-4 w-4" />}
              loading={actionLoading === "resume"}
              onClick={pauseOrResume}
            >
              Resume session
            </Button>
            <Button variant="secondary" loading={actionLoading === "end"} onClick={endSession} icon={<Flag className="h-4 w-4" />}>
              End and see report
            </Button>
          </div>
        </Card>
      ) : question ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{question.category}</Badge>
                <Badge tone={question.difficulty === "advanced" ? "rose" : question.difficulty === "basic" ? "emerald" : "amber"}>
                  {question.difficulty}
                </Badge>
                {question.is_followup && <Badge tone="violet">Follow-up</Badge>}
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                Question {answeredCount + 1} of {totalQuestions}
              </span>
            </div>

            <div className="p-5">
              <p className="text-lg font-bold leading-relaxed text-slate-900 dark:text-white">
                {question.question_text ?? question.question}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SpeakButton
                  text={question.question_text ?? question.question ?? ""}
                  label="Read question aloud"
                  size="md"
                />
                <span className="text-[11px] text-slate-400">
                  Answer in your own words. Numbers and project evidence earn higher scores.
                </span>
              </div>
              <SourceNote source={question.source_reference} />
            </div>

            <div className="border-t border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label htmlFor="viva-answer" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Your answer
                </label>
                <span className={cn("text-[11px]", answer.length > 11000 ? "text-rose-500" : "text-slate-400")}>
                  {answer.length}/12000
                </span>
              </div>
              <Textarea
                id="viva-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value.slice(0, 12000))}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (!submitting) void submit();
                  }
                }}
                rows={8}
                maxLength={12000}
                placeholder="Structure your answer: definition → mechanism → how it appears in your project → evidence or limitation."
                className="mt-2"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <VoiceRecorder
                  onTranscript={(text) => {
                    setInputType("voice");
                    setAnswer((current) => `${current ? `${current} ` : ""}${text}`.slice(0, 12000));
                  }}
                  disabled={submitting}
                />
                <div className="flex items-center gap-2">
                  <span className="hidden text-[11px] text-slate-400 sm:inline">Ctrl + Enter to submit</span>
                  <Button
                    icon={<Send className="h-4 w-4" />}
                    loading={submitting}
                    disabled={!answer.trim() || answer.trim().length < 1}
                    onClick={submit}
                  >
                    Submit answer
                  </Button>
                </div>
              </div>
              {timeUp && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The planned time is over. Submit this answer to finish the session and generate your report.
                </p>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Session controls</p>
              <div className="mt-3 space-y-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  icon={<Pause className="h-4 w-4" />}
                  loading={actionLoading === "pause"}
                  onClick={pauseOrResume}
                >
                  Pause session
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  icon={<Flag className="h-4 w-4" />}
                  loading={actionLoading === "end"}
                  onClick={endSession}
                >
                  End and see report
                </Button>
              </div>
              <Divider className="my-4" />
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Ending early is allowed. The report is generated from the answers evaluated so far and
                clearly states how many questions were attempted.
              </p>
            </Card>

            <Card>
              <CardHeader
                title="Your progress"
                description={`${answeredCount} answered · ${Math.max(0, totalQuestions - answeredCount)} remaining`}
              />
              <div className="mt-3 space-y-2 p-4 pt-0">
                {(data.turns ?? []).length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">The first question is ready.</p>
                )}
                {(data.turns ?? []).map((turn) => (
                  <div
                    key={turn.question_id}
                    className={cn(
                      "rounded-lg border p-2.5",
                      turn.answer_id === null
                        ? "border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5"
                        : "border-slate-200 dark:border-slate-800",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                        {turn.question}
                      </p>
                      {turn.score !== null ? (
                        <ScorePill score={turn.score} className="shrink-0" />
                      ) : (
                        <span className="shrink-0 text-[10px] font-semibold text-brand-500">current</span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {turn.category}
                      {turn.is_followup ? " · follow-up" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <ListChecks className="h-3.5 w-3.5 text-brand-500" /> Answering well
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                <li>• Define the concept before applying it.</li>
                <li>• Point to a specific module, table or experiment in your project.</li>
                <li>• Quantify results where possible.</li>
                <li>• State one limitation to show depth.</li>
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="No active question found"
          description="The session may have ended. Refresh or open the report if one is available."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={reload}>
                Refresh session
              </Button>
              <Link to={`/viva/${sessionId}/report`}>
                <Button>Open report</Button>
              </Link>
            </div>
          }
        />
      )}

      {status !== "completed" && !completed && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <Square className="h-2.5 w-2.5" /> Answers are evaluated with the fixed weighted formula: accuracy 30% · relevance 20%
          · completeness 20% · understanding 20% · clarity 10%.
        </p>
      )}
    </div>
  );
}
