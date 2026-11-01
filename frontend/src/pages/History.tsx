import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  History as HistoryIcon,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ProgressBar,
  Select,
  Spinner,
  StatCard,
} from "../components/UI";
import { DifficultyBadge, ScorePill, SessionStatusBadge } from "../components/Widgets";
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { HistoryResponse, Project } from "../lib/types";
import { formatDate, formatDateTime, formatNumber } from "../lib/utils";

const PAGE_SIZE = 12;

export function History() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState(0);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const projects = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );

  const { data, loading, error, reload } = useApiResource<HistoryResponse>(
    () =>
      api
        .get<HistoryResponse>("/viva/sessions", {
          params: {
            page,
            page_size: PAGE_SIZE,
            project_id: projectId || undefined,
            status: status || undefined,
          },
        })
        .then((response) => response.data),
    [page, projectId, status],
  );

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((session) =>
      `${session.project_title ?? ""} ${session.difficulty} ${session.status}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data, query]);

  const scored = items.filter((item) => item.overall_score !== null);
  const averageScore = scored.length
    ? scored.reduce((total, item) => total + (item.overall_score ?? 0), 0) / scored.length
    : null;
  const activeCount = items.filter((item) => item.status === "active" || item.status === "paused").length;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const resetFilters = () => {
    setProjectId(0);
    setStatus("");
    setQuery("");
    setPage(1);
  };

  const remove = async (sessionId: number, title: string) => {
    if (!window.confirm(`Delete the session "${title}"? Its answers, evaluations and report will be removed permanently.`)) {
      return;
    }
    setDeletingId(sessionId);
    try {
      await api.delete(`/viva/${sessionId}`);
      toast("Session deleted.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const hasFilters = Boolean(projectId || status || query.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Session history"
        description="Every mock viva you have started, with its stored score and progress. Reports are generated only from real evaluated answers."
        actions={
          <Link to="/viva/new">
            <Button icon={<Play className="h-4 w-4" />}>Start new viva</Button>
          </Link>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sessions in total"
          value={data?.total ?? 0}
          hint={`${PAGE_SIZE} per page`}
          icon={<HistoryIcon className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Need attention"
          value={activeCount}
          hint="Active or paused on this page"
          icon={<Play className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Average on this page"
          value={averageScore === null ? "—" : `${formatNumber(averageScore)}/100`}
          hint={`${scored.length} scored session(s)`}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="Visible results"
          value={items.length}
          hint={query.trim() ? "Matching this search" : "On the current page"}
          icon={<Search className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_200px_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Search this page
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Project, difficulty or status"
                aria-label="Search sessions"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Project</span>
            <Select
              value={projectId}
              onChange={(event) => {
                setProjectId(Number(event.target.value));
                setPage(1);
              }}
            >
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
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </Select>
          </label>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>
            Clear
          </Button>
        </div>
      </Card>

      {loading && !data ? (
        <Spinner label="Loading session history…" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={hasFilters ? "No sessions match these filters" : "No sessions yet"}
          description={
            hasFilters
              ? "Try removing a filter, or start a new mock viva to build your history."
              : "Your first mock viva will appear here with its score, difficulty and full report."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hasFilters && (
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
              <Link to="/viva/new">
                <Button icon={<Play className="h-4 w-4" />}>Start mock viva</Button>
              </Link>
            </div>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No match on this page"
          description="The search only filters the current page. Clear the search or move to another page."
          action={
            <Button variant="secondary" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((session) => {
            const completed = session.status === "completed";
            const open = session.status === "active" || session.status === "paused";
            return (
              <Card key={session.id} className="p-4 transition hover:border-slate-300 dark:hover:border-slate-700 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={
                        completed
                          ? "rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : open
                            ? "rounded-xl bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                            : "rounded-xl bg-slate-100 p-2.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }
                    >
                      {completed ? <FileText className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={completed ? `/viva/${session.id}/report` : `/viva/${session.id}`}
                          className="truncate text-sm font-bold text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                        >
                          {session.project_title ?? `Session #${session.id}`}
                        </Link>
                        <SessionStatusBadge status={session.status} />
                        <DifficultyBadge difficulty={session.difficulty} />
                        <Badge tone="slate">{session.mode}</Badge>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {formatDate(session.started_at)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {session.elapsed_minutes ? `${formatNumber(session.elapsed_minutes, 0)} min` : `${session.duration_minutes} min planned`}
                        </span>
                        <span>
                          {session.answered_count}/{session.question_count} questions answered
                        </span>
                        {session.completed_at && <span>Completed {formatDateTime(session.completed_at)}</span>}
                      </p>
                      <div className="mt-3 max-w-md">
                        <ProgressBar value={session.progress ?? 0} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <ScorePill score={session.overall_score} />
                    <Link to={completed ? `/viva/${session.id}/report` : `/viva/${session.id}`}>
                      <Button
                        size="sm"
                        variant={completed ? "secondary" : "primary"}
                        icon={completed ? <FileText className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      >
                        {completed ? "View report" : session.status === "paused" ? "Resume" : "Continue"}
                      </Button>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete session"
                      loading={deletingId === session.id}
                      onClick={() => remove(session.id, session.project_title ?? `Session #${session.id}`)}
                      className="text-rose-500 hover:text-rose-600"
                    >
                      {deletingId === session.id ? null : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data && data.total > data.page_size && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page {data.page} of {totalPages} · {data.total} session(s)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
            >
              Next <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Tip: unfinished sessions keep their stored answers. Resume to continue from the next adaptive question.
      </p>
    </div>
  );
}

export default History;
