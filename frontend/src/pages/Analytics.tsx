import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Download,
  Filter,
  Gauge,
  GraduationCap,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ProgressBar,
  Select,
  Spinner,
  StatCard,
} from "../components/UI";
import { ScorePill, ScoreText, TopicChips } from "../components/Widgets";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { DashboardData, Project } from "../lib/types";
import { DIFFICULTY_OPTIONS, formatDate, formatNumber } from "../lib/utils";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.94)",
  color: "#f8fafc",
  fontSize: 12,
};

const RANGES = [
  { value: "all", label: "All time", days: 0 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "180", label: "Last 6 months", days: 180 },
];

export function Analytics() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState(0);
  const [difficulty, setDifficulty] = useState("");
  const [range, setRange] = useState("all");

  const projects = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );

  const startDate = useMemo(() => {
    const option = RANGES.find((item) => item.value === range);
    if (!option || !option.days) return undefined;
    const date = new Date();
    date.setDate(date.getDate() - option.days);
    return date.toISOString();
  }, [range]);

  const { data, loading, error, reload } = useApiResource<DashboardData>(
    () =>
      api
        .get<DashboardData>("/analytics/dashboard", {
          params: {
            project_id: projectId || undefined,
            difficulty: difficulty || undefined,
            start_date: startDate,
          },
        })
        .then((response) => response.data),
    [projectId, difficulty, range],
  );

  const activeFilters = (projectId ? 1 : 0) + (difficulty ? 1 : 0) + (range !== "all" ? 1 : 0);

  const resetFilters = () => {
    setProjectId(0);
    setDifficulty("");
    setRange("all");
  };

  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      ["Metric", "Value"],
      ["Average score", String(data.summary.average_score)],
      ["Overall performance", data.summary.overall_performance],
      ["Sessions", String(data.summary.total_sessions)],
      ["Completed sessions", String(data.summary.completed_sessions)],
      ["Answers evaluated", String(data.summary.total_questions)],
      [],
      ["Session date", "Project", "Difficulty", "Status", "Score"],
      ...data.trend.map((item) => [
        item.date ?? "",
        item.project,
        item.difficulty,
        item.status,
        String(item.score),
      ]),
      [],
      ["Category", "Average score", "Attempts", "Verdict"],
      ...data.category_scores.map((item) => [
        item.category,
        String(item.average_score),
        String(item.attempts),
        item.verdict,
      ]),
      [],
      ["Criterion", "Average score"],
      ...data.criteria_scores.map((item) => [item.criterion, String(item.score)]),
      [],
      ["Missing concept", "Occurrences"],
      ...data.recurring_missing_concepts.map((item) => [item.concept, String(item.count)]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `viva-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Analytics exported as CSV.", "success");
  };

  if (loading && !data) return <Spinner label="Crunching your performance data…" />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary } = data;
  const hasAnswers = summary.total_questions > 0;
  const weakestCategories = [...data.category_scores].sort((a, b) => a.average_score - b.average_score);
  const strongestCriterion = [...data.criteria_scores].sort((a, b) => b.score - a.score)[0];
  const weakestCriterion = [...data.criteria_scores].sort((a, b) => a.score - b.score)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Performance analytics"
        description="Every number below is computed from stored evaluations — no estimated or fabricated results."
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
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={exportCsv}
              disabled={!hasAnswers}
            >
              Export CSV
            </Button>
            <Link to="/recommendations">
              <Button icon={<Target className="h-4 w-4" />}>My plan</Button>
            </Link>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Filters
            {activeFilters > 0 && <Badge tone="brand">{activeFilters} active</Badge>}
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Project</span>
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
              <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Difficulty
              </span>
              <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="">All difficulties</option>
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Period</span>
              <Select value={range} onChange={(event) => setRange(event.target.value)}>
                {RANGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={activeFilters === 0}>
            Clear filters
          </Button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <CalendarRange className="h-3 w-3" />
          {startDate ? `Showing evaluations since ${formatDate(startDate)}.` : "Showing all stored evaluations."}
        </p>
      </Card>

      {!hasAnswers ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="Not enough data for these filters"
          description="Analytics only appear after answers have been evaluated. Take a mock viva or try a practice question, then return here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/viva/new">
                <Button>Start mock viva</Button>
              </Link>
              <Link to="/practice">
                <Button variant="secondary">Practice a question</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Overall score"
              value={
                <span className="flex items-baseline gap-2">
                  {formatNumber(summary.average_score)}
                  <span className="text-sm font-semibold text-slate-400">/100</span>
                </span>
              }
              hint={summary.overall_performance}
              icon={<Trophy className="h-5 w-5" />}
              tone="brand"
            />
            <StatCard
              label="Trend"
              value={
                summary.improvement === null
                  ? "Baseline"
                  : `${summary.improvement >= 0 ? "+" : ""}${formatNumber(summary.improvement)}`
              }
              hint={summary.improvement === null ? "No previous session to compare" : "Versus previous session"}
              icon={<TrendingUp className="h-5 w-5" />}
              tone={summary.improvement !== null && summary.improvement < 0 ? "rose" : "emerald"}
            />
            <StatCard
              label="Answers evaluated"
              value={summary.total_questions}
              hint={`${summary.completed_sessions} of ${summary.total_sessions} sessions completed`}
              icon={<GraduationCap className="h-5 w-5" />}
              tone="violet"
            />
            <StatCard
              label="Best answer"
              value={`${formatNumber(summary.highest_answer_score)}/100`}
              hint={
                strongestCriterion
                  ? `Strongest criterion: ${strongestCriterion.criterion}`
                  : "No evaluated answers yet"
              }
              icon={<Gauge className="h-5 w-5" />}
              tone="sky"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Score progression"
                description="Average answer score per scored session. Look for a sustained rise, not a single lucky session."
                action={<Badge tone="slate">{data.trend.length} scored sessions</Badge>}
              />
              <div className="h-72 w-full px-2 pb-4 pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 5, right: 16, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string | null) =>
                        value ? formatDate(value, { day: "2-digit", month: "short" }) : "—"
                      }
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(value) => formatDate(String(value))}
                      formatter={(value) => [`${formatNumber(Number(value))}/100`, "Average score"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fill="url(#analyticsFill)"
                      dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Criteria profile" description="Weighted criteria behind every total score." />
              <div className="h-52 w-full px-2 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.criteria_scores}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      type="category"
                      dataKey="key"
                      width={82}
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${formatNumber(Number(value))}/100`, "Average"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.criterion ?? "Criterion"}
                    />
                    <Bar dataKey="score" radius={[0, 6, 6, 0]} fill="#8b5cf6" barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 px-5 pb-5">
                {data.criteria_scores.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">{item.criterion}</span>
                    <ScoreText score={item.score} />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Category performance"
                description="Average score and attempt count per viva category."
                action={
                  weakestCategories[0] ? (
                    <Badge tone="rose">Focus: {weakestCategories[0].category}</Badge>
                  ) : undefined
                }
              />
              <div className="space-y-3 p-5">
                {data.category_scores.map((item) => (
                  <div key={item.category}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.category}
                        <span className="ml-1.5 text-slate-400">· {item.attempts} answer(s)</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={item.verdict === "strong" ? "emerald" : item.verdict === "weak" ? "rose" : "amber"}>
                          {item.verdict}
                        </Badge>
                        <ScorePill score={item.average_score} />
                      </span>
                    </div>
                    <ProgressBar value={item.average_score} />
                  </div>
                ))}
                {data.category_scores.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No category data in this period.</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Difficulty performance" description="How you cope as the examiner raises the level." />
              <div className="h-60 w-full px-2 pb-2 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.difficulty_scores} margin={{ top: 5, right: 16, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                    <XAxis
                      dataKey="difficulty"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${formatNumber(Number(value))}/100`, "Average"]}
                    />
                    <Bar dataKey="average_score" radius={[6, 6, 0, 0]} fill="#6366f1" barSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 px-5 pb-5">
                {data.difficulty_scores.map((item) => (
                  <Badge key={item.difficulty} tone="slate">
                    {item.difficulty} · {item.attempts} answer(s)
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recurring missing concepts"
                description="Concepts that evaluators repeatedly flagged across your answers."
                action={<Badge tone="amber">{data.recurring_missing_concepts.length} concepts</Badge>}
              />
              <div className="p-5">
                {data.recurring_missing_concepts.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No repeated gaps detected. Keep answering to confirm the pattern.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.recurring_missing_concepts.map((item) => {
                      const max = Math.max(...data.recurring_missing_concepts.map((entry) => entry.count), 1);
                      return (
                        <div key={item.concept}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                            <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              {item.concept}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">{item.count}×</span>
                          </div>
                          <ProgressBar value={(item.count / max) * 100} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Topic distribution" description="Strong, average and weak categories." />
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.topic_distribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={66}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {data.topic_distribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 pb-5 text-[11px] text-slate-500 dark:text-slate-400">
                  {data.topic_distribution.map((entry) => (
                    <span key={entry.name} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name} {entry.value}
                    </span>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Focus recommendation
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {weakestCriterion
                    ? `Your lowest criterion is ${weakestCriterion.criterion} (${formatNumber(weakestCriterion.score)}/100). `
                    : ""}
                  {weakestCategories[0]
                    ? `Start with ${weakestCategories[0].category}, then retake a mixed-difficulty viva and compare the trend.`
                    : "Complete more questions to unlock a targeted recommendation."}
                </p>
                <Link to="/recommendations" className="mt-3 inline-flex">
                  <Button size="sm" variant="subtle" icon={<Target className="h-3.5 w-3.5" />}>
                    Open preparation plan
                  </Button>
                </Link>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader title="Topic strengths" description="Derived from category averages with enough attempts." />
            <div className="grid gap-5 p-5 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Strong
                </p>
                <div className="mt-2">
                  <TopicChips topics={data.strong_topics} empty="No strong topics yet." max={10} />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Average
                </p>
                <div className="mt-2">
                  <TopicChips topics={data.average_topics} empty="No average topics yet." max={10} />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">Weak</p>
                <div className="mt-2">
                  <TopicChips topics={data.weak_topics} empty="No weak topics detected." max={10} />
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <span>
              Scoring weights: accuracy 30% · relevance 20% · completeness 20% · understanding 20% · clarity 10%.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Engine: {data.ai_mode === "gemini" ? "Gemini" : "Offline heuristic"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default Analytics;
