import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Circle,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Select,
  Spinner,
} from "../components/UI";
import { PriorityBadge, SectionLabel, TickList } from "../components/Widgets";
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { Project, Recommendation } from "../lib/types";
import { formatDate, formatNumber } from "../lib/utils";

interface RecommendationList {
  items: Recommendation[];
  total: number;
  open: number;
  done: number;
}

interface GenerateResult {
  recommendations: Recommendation[];
  recommended_difficulty: string;
  engine: string;
  context: {
    average_score?: number;
    attempts?: number;
    improvement?: number | null;
  };
  generated_at: string;
  recurring_missing_concepts: Array<{ concept: string; count: number }>;
  weak_topics: string[];
}

export function Recommendations() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState(0);
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [generated, setGenerated] = useState<GenerateResult | null>(null);

  const projects = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );

  const { data, loading, error, reload } = useApiResource<RecommendationList>(
    () =>
      api
        .get<RecommendationList>("/recommendations", {
          params: {
            project_id: projectId || undefined,
            status: status === "all" ? undefined : status,
          },
        })
        .then((response) => response.data),
    [projectId, status],
  );

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    return {
      high: items.filter((item) => item.priority === "high"),
      medium: items.filter((item) => item.priority === "medium"),
      low: items.filter((item) => item.priority === "low"),
    };
  }, [data]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: result } = await api.post<GenerateResult>("/recommendations/generate", {
        project_id: projectId || null,
      });
      setGenerated(result);
      setStatus("open");
      reload();
      toast(
        result.recommendations.length
          ? `${result.recommendations.length} recommendation(s) generated from your evaluated answers.`
          : "No open gaps found — complete more answers to generate recommendations.",
        "success",
      );
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setGenerating(false);
    }
  };

  const toggleStatus = async (rec: Recommendation) => {
    setBusyId(rec.id);
    try {
      await api.patch(`/recommendations/${rec.id}`, { status: rec.status === "open" ? "done" : "open" });
      toast(rec.status === "open" ? "Marked as revised." : "Reopened for revision.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (rec: Recommendation) => {
    if (!window.confirm(`Delete the recommendation "${rec.topic}"? This cannot be undone.`)) return;
    setBusyId(rec.id);
    try {
      await api.delete(`/recommendations/${rec.id}`);
      toast("Recommendation deleted.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const renderGroup = (label: string, items: Recommendation[], tone: "rose" | "amber" | "slate") => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-xs text-slate-400">{items.length} item(s)</span>
        </div>
        {items.map((rec) => {
          const isOpen = rec.status === "open";
          return (
            <Card key={rec.id} className="overflow-hidden">
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span
                    className={
                      isOpen
                        ? "mt-0.5 rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                        : "mt-0.5 rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                    }
                  >
                    {isOpen ? <Lightbulb className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{rec.topic}</h3>
                      <PriorityBadge priority={rec.priority} />
                      <Badge tone={isOpen ? "amber" : "emerald"}>{rec.status}</Badge>
                      <Badge tone="slate">{rec.source === "gemini" ? "Gemini" : "Offline engine"}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {rec.recommendation}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {rec.project_id ? `Project #${rec.project_id} · ` : "All projects · "}
                      Updated {formatDate(rec.updated_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                  <Button
                    size="sm"
                    variant={isOpen ? "subtle" : "secondary"}
                    loading={busyId === rec.id}
                    icon={isOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    onClick={() => toggleStatus(rec)}
                  >
                    {isOpen ? "Mark revised" : "Reopen"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${rec.topic}`}
                    onClick={() => remove(rec)}
                    disabled={busyId === rec.id}
                    className="text-rose-500 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {rec.practice_questions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                    className="flex w-full items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/40"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <BrainCircuit className="h-3.5 w-3.5 text-brand-500" />
                      {rec.practice_questions.length} practice question(s)
                    </span>
                    <ChevronDown
                      className={
                        expanded === rec.id
                          ? "h-4 w-4 rotate-180 text-slate-400 transition"
                          : "h-4 w-4 text-slate-400 transition"
                      }
                    />
                  </button>
                  {expanded === rec.id && (
                    <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/30">
                      {rec.practice_questions.map((question, index) => (
                        <div
                          key={index}
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{question}</p>
                          <Link
                            to={{
                              pathname: "/practice",
                              search: new URLSearchParams({
                                question,
                                topic: rec.topic,
                                ...(rec.project_id ? { project: String(rec.project_id) } : {}),
                              }).toString(),
                            }}
                            className="shrink-0"
                          >
                            <Button size="sm" variant="secondary" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                              Practise
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  if (loading && !data) return <Spinner label="Loading your preparation plan…" />;

  const items = data?.items ?? [];
  const empty = items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personalised plan"
        title="Recommendations"
        description="Generated strictly from your stored evaluations: weak categories, missing concepts and criterion gaps."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={reload}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              icon={<Sparkles className="h-4 w-4" />}
              onClick={generate}
              loading={generating}
            >
              Generate plan
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Scope</span>
            <Select value={projectId} onChange={(event) => setProjectId(Number(event.target.value))}>
              <option value={0}>All projects</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value as "open" | "done" | "all")}>
              <option value="open">Open</option>
              <option value="done">Revised</option>
              <option value="all">All</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
              <p className="text-lg font-extrabold text-slate-900 dark:text-white">{data?.open ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Open</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
              <p className="text-lg font-extrabold text-slate-900 dark:text-white">{data?.done ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Revised</p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Generating replaces existing open recommendations in the selected scope, so the plan always reflects your
          latest evidence. Revised items are kept as a record.
        </p>
      </Card>

      {generated && (
        <Card className="overflow-hidden border-brand-200 dark:border-brand-500/30">
          <div className="bg-gradient-to-r from-brand-50 to-violet-50 p-5 dark:from-brand-500/10 dark:to-violet-500/10">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">
                <Sparkles className="h-3 w-3" /> Plan refreshed
              </Badge>
              <Badge tone={generated.engine === "gemini" ? "violet" : "emerald"}>
                {generated.engine === "gemini" ? "Gemini" : "Offline engine"}
              </Badge>
              <Badge tone="slate">Suggested difficulty: {generated.recommended_difficulty}</Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Average score
                </p>
                <p className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {formatNumber(generated.context.average_score)}/100
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Answers considered
                </p>
                <p className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {generated.context.attempts ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Weak topics
                </p>
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {generated.weak_topics.length ? generated.weak_topics.slice(0, 3).join(", ") : "None detected"}
                </p>
              </div>
            </div>
            {generated.recurring_missing_concepts.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Recurring gaps: {generated.recurring_missing_concepts.slice(0, 5).map((item) => item.concept).join(", ")}.
              </p>
            )}
          </div>
        </Card>
      )}

      {empty ? (
        <EmptyState
          icon={<Lightbulb className="h-6 w-6" />}
          title={status === "done" ? "No revised recommendations" : "No recommendations in this scope"}
          description="Recommendations are derived from evaluated answers. Complete a mock viva or practice question, then generate your plan."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon={<Sparkles className="h-4 w-4" />} onClick={generate} loading={generating}>
                Generate from my results
              </Button>
              <Link to="/practice">
                <Button variant="secondary">Practice a question</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {renderGroup("High priority", grouped.high, "rose")}
          {renderGroup("Medium priority", grouped.medium, "amber")}
          {renderGroup("Low priority", grouped.low, "slate")}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="How this plan is built" description="Transparent, evidence-based, never invented." />
          <div className="p-5 pt-3">
            <TickList
              items={[
                "Weak and average categories are ranked by average score and number of attempts.",
                "Missing concepts are counted across stored evaluations and prioritised by repetition.",
                "Criterion scores identify whether accuracy, completeness, relevance, understanding or clarity needs work.",
                "Each recommendation includes practice questions you can answer immediately.",
              ]}
              tone="brand"
            />
          </div>
        </Card>
        <Card className="p-5">
          <SectionLabel icon={<Target className="h-3.5 w-3.5" />}>Next action</SectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Pick one high-priority topic, answer its practice question, then retake a mock viva at the suggested
            difficulty. Compare the trend on the analytics page.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/viva/new">
              <Button size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                Start viva
              </Button>
            </Link>
            <Link to="/analytics">
              <Button size="sm" variant="secondary">
                View analytics
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {!data && loading && <Spinner label="Loading recommendations…" />}
    </div>
  );
}

export default Recommendations;
