import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  FileStack,
  FolderOpen,
  GraduationCap,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Spinner,
  Textarea,
} from "../components/UI";
import { ScorePill } from "../components/Widgets";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { Project } from "../lib/types";
import { formatDate } from "../lib/utils";
import { useToast } from "../context/ToastContext";

export function Projects() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const projects = useMemo(() => {
    const items = data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((project) =>
      `${project.title} ${project.description} ${project.domain}`.toLowerCase().includes(needle),
    );
  }, [data, query]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDomain("");
    setFormError("");
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (title.trim().length < 2) {
      setFormError("Give your project a title of at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const { data: project } = await api.post<Project>("/projects", {
        title: title.trim(),
        description: description.trim(),
        domain: domain.trim(),
      });
      toast("Project created. Upload your report next.", "success");
      setCreateOpen(false);
      resetForm();
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async (project: Project) => {
    const confirmed = window.confirm(
      `Delete "${project.title}"? This also deletes its documents, viva sessions and evaluations. This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(project.id);
    try {
      await api.delete(`/projects/${project.id}`);
      toast("Project and all related data deleted.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Each project is a private knowledge base built from your report. Documents feed question generation, evaluation and analytics."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New project
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading && !data ? (
        <Spinner label="Loading projects…" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="Create your first project"
          description="Add your final-year or research project, then upload the report so the examiner can ask grounded questions."
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Create project
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects by title, domain or description"
              className="pl-9"
              aria-label="Search projects"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const readyPercent = project.document_count
                ? Math.round((project.ready_documents / project.document_count) * 100)
                : 0;
              return (
                <Card key={project.id} className="flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-xl bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        <FileStack className="h-5 w-5" />
                      </span>
                      <div className="flex items-center gap-2">
                        {project.domain && <Badge tone="slate">{project.domain}</Badge>}
                        <Badge tone={project.ready_documents > 0 ? "emerald" : "amber"}>
                          {project.ready_documents > 0 ? "Ready" : "Needs report"}
                        </Badge>
                      </div>
                    </div>

                    <Link to={`/projects/${project.id}`} className="mt-3 block">
                      <h3 className="text-base font-bold text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400">
                        {project.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {project.description || "No description provided."}
                      </p>
                    </Link>

                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span>
                          {project.ready_documents}/{project.document_count} documents indexed
                        </span>
                        <span>{readyPercent}%</span>
                      </div>
                      <ProgressBar value={readyPercent} />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-950/40">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">{project.session_count}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Sessions</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-950/40">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {project.ready_documents}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Docs ready</p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 py-2 dark:bg-slate-950/40">
                        <ScorePill score={project.latest_score} />
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">Best score</p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] text-slate-400">Updated {formatDate(project.updated_at)}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      Open workspace <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <div className="flex items-center gap-1">
                      <Link to={`/viva/new?project=${project.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<GraduationCap className="h-3.5 w-3.5" />}
                          disabled={project.ready_documents === 0}
                          title={
                            project.ready_documents === 0
                              ? "Upload and process a document first"
                              : "Start a mock viva for this project"
                          }
                        >
                          Viva
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${project.title}`}
                        loading={deletingId === project.id}
                        onClick={() => removeProject(project)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        {deletingId === project.id ? null : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {projects.length === 0 && (
            <EmptyState
              icon={<BookOpenCheck className="h-5 w-5" />}
              title="No matching projects"
              description="Try a different search term."
            />
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        title="Create a project"
        description="Use the exact title of your report so questions feel authentic."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-project-form" loading={saving}>
              Create project
            </Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={createProject} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {formError}
            </div>
          )}
          <Field label="Project title" htmlFor="project-title" hint="Example: AI-Powered Student Performance Predictor">
            <Input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Your project title"
              maxLength={255}
              required
            />
          </Field>
          <Field label="Domain" htmlFor="project-domain" hint="Optional, for example Machine Learning or Web Development.">
            <Input
              id="project-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="Machine Learning"
              maxLength={120}
            />
          </Field>
          <Field label="Short description" htmlFor="project-description" hint="What problem does it solve, and what did you build?">
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="A short summary of the problem, approach and outcome."
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
