import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  FileStack,
  Flame,
  GraduationCap,
  Lightbulb,
  Play,
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
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBanner, PageHeader, ProgressBar, Spinner, StatCard } from "../components/UI";
import { ScorePill, ScoreText, SessionStatusBadge, TopicChips } from "../components/Widgets";
import { api } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { DashboardData } from "../lib/types";
import { formatDate, formatNumber } from "../lib/utils";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.94)",
  color: "#f8fafc",
  fontSize: 12,
};

export function Dashboard() {
  const { data, loading, error, reload } = useApiResource<DashboardData>(
    () => api.get<DashboardData>("/analytics/dashboard").then((response) => response.data),
    [],
  );

  if (loading && !data) return <Spinner label="Building your preparation dashboard…" />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary } = data;
  const hasPractice = summary.total_questions > 0;
  const needsProject = summary.total_projects === 0;
  const needsDocument = !needsProject && summary.ready_documents === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Preparation overview"
        title={
          <>
            Welcome back{summary.total_sessions ? ", examiner ready." : "."}
          </>
        }
        description={
          hasPractice
            ? `${summary.overall_performance} overall performance · ${summary.total_questions} evaluated answers across ${summary.total_sessions} session${summary.total_sessions === 1 ? "" : "s"}.`
            : "Create a project, upload your report and take your first mock viva to unlock real analytics."
        }
        actions={
          <>
            <Link to="/practice">
              <Button variant="secondary" icon={<BrainCircuit className="h-4 w-4" />}>
                Quick practice
              </Button>
            </Link>
            <Link to="/viva/new">
              <Button icon={<Play className="h-4 w-4" />}>Start mock viva</Button>
            </Link>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {data.active_session && (
        <Card className="flex flex-col gap-4 border-brand-200 bg-gradient-to-r from-brand-50 to-violet-50 p-5 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-violet-500/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white p-2.5 text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Unfinished viva in progress</p>
                <SessionStatusBadge status={data.active_session.status} />
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {data.active_session.project_title} · {data.active_session.difficulty} ·{" "}
                {data.active_session.question_count} questions
              </p>
            </div>
          </div>
          <Link to={`/viva/${data.active_session.id}`}>
            <Button size="sm" icon={<ArrowRight className="h-4 w-4" />}>
              Continue session
            </Button>
          </Link>
        </Card>
      )}

      {needsProject && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40">
            <Badge tone="brand">
              <Flame className="h-3 w-3" /> Get started
            </Badge>
            <h2 className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">
              Three steps to your first grounded mock viva
            </h2>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {[
              {
                icon: FileStack,
                title: "1. Create a project",
                text: "Add the project title, domain and a short description.",
                to: "/projects",
                action: "Create project",
              },
              {
                icon: BookOpenCheck,
                title: "2. Upload your report",
                text: "PDF, DOCX or TXT. It is chunked and indexed privately.",
                to: "/documents",
                action: "Upload report",
              },
              {
                icon: GraduationCap,
                title: "3. Take a mock viva",
                text: "Adaptive questions grounded in your own document.",
                to: "/viva/new",
                action: "Start viva",
              },
            ].map((step) => (
              <div key={step.title} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <step.icon className="h-5 w-5 text-brand-500" />
                <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{step.text}</p>
                <Link to={step.to} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                  {step.action} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {needsDocument && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Your knowledge base is empty</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload a processed report so the examiner can ask project-specific questions.
              </p>
            </div>
          </div>
          <Link to="/documents">
            <Button size="sm" variant="secondary">
              Upload a document
            </Button>
          </Link>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall score"
          value={<span className="flex items-baseline gap-2">{formatNumber(summary.average_score)}<span className="text-sm font-semibold text-slate-400">/100</span></span>}
          hint={
            summary.improvement === null
              ? summary.overall_performance
              : `${summary.improvement >= 0 ? "+" : ""}${formatNumber(summary.improvement)} vs previous session`
          }
          icon={<Trophy className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Sessions"
          value={`${summary.completed_sessions}/${summary.total_sessions}`}
          hint="Completed / attempted"
          icon={<GraduationCap className="h-5 w-5" />}
          tone="violet"
        />
        <StatCard
          label="Answers evaluated"
          value={summary.total_questions}
          hint={summary.highest_answer_score ? `Best answer ${formatNumber(summary.highest_answer_score)}/100` : "No answers yet"}
          icon={<Target className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="Open recommendations"
          value={summary.open_recommendations}
          hint={`${summary.ready_documents} indexed document${summary.ready_documents === 1 ? "" : "s"}`}
          icon={<Lightbulb className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      {hasPractice ? (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Score trend"
                description="Average answer score for every scored session, oldest to newest."
                action={<Badge tone="slate"><TrendingUp className="h-3 w-3" /> {data.trend.length} sessions</Badge>}
              />
              <div className="h-64 w-full px-2 pb-4 pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 5, right: 16, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.42} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string | null) => (value ? formatDate(value, { day: "2-digit", month: "short" }) : "—")}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(value) => formatDate(String(value))}
                      formatter={(value) => [`${formatNumber(Number(value))}/100`, "Score"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fill="url(#scoreFill)"
                      dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Criterion averages" description="Where marks are won and lost." />
              <div className="h-64 w-full px-2 pb-4 pt-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.criteria_scores} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                    <XAxis dataKey="key" hide />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${formatNumber(Number(value))}/100`, "Average"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.criterion ?? "Criterion"}
                    />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
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

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Category performance"
                description="Average score per viva category, based only on evaluated answers."
              />
              <div className="space-y-3 p-5">
                {data.category_scores.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No category data yet.</p>
                )}
                {data.category_scores.map((item) => (
                  <div key={item.category}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.category}
                        <span className="ml-1.5 text-slate-400">· {item.attempts}</span>
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
                <div className="space-y-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Strong topics
                    </p>
                    <div className="mt-2">
                      <TopicChips topics={data.strong_topics} empty="Keep practising to build strengths." max={4} />
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                      <Flame className="h-3.5 w-3.5" /> Weak topics
                    </p>
                    <div className="mt-2">
                      <TopicChips topics={data.weak_topics} empty="No weak categories detected yet." max={4} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader
              title="Recent sessions"
              action={
                <Link to="/history" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  View all
                </Link>
              }
            />
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {data.recent_sessions.length === 0 && (
                <div className="p-5">
                  <EmptyState
                    icon={<GraduationCap className="h-5 w-5" />}
                    title="No sessions yet"
                    description="Start your first mock viva to see history here."
                    action={
                      <Link to="/viva/new">
                        <Button size="sm">Start mock viva</Button>
                      </Link>
                    }
                  />
                </div>
              )}
              {data.recent_sessions.map((session) => (
                <Link
                  key={session.id}
                  to={session.status === "completed" ? `/viva/${session.id}/report` : `/viva/${session.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {session.project_title ?? "Project"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(session.started_at)} · {session.difficulty} · {session.question_count} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SessionStatusBadge status={session.status} />
                    <ScorePill score={session.overall_score} />
                    <ArrowUpRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="No evaluated answers yet"
          description="Analytics, trends and recommendations are computed from real answers. Take a mock viva or use quick practice to create your baseline."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/viva/new">
                <Button icon={<Play className="h-4 w-4" />}>Start a mock viva</Button>
              </Link>
              <Link to="/practice">
                <Button variant="secondary">Practice one question</Button>
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
