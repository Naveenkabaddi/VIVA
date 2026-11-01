import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  CloudUpload,
  Cpu,
  FileText,
  FileWarning,
  GraduationCap,
  Layers,
  ListChecks,
  Pencil,
  Play,
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
  Divider,
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
import {
  DocumentStatusBadge,
  ScorePill,
  SectionLabel,
  SessionStatusBadge,
  TickList,
  TopicChips,
} from "../components/Widgets";
import { ScoreRing } from "../components/ScoreRing";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource, useInterval } from "../lib/hooks";
import type { DocumentItem, ProjectDetail as ProjectDetailType } from "../lib/types";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "../lib/utils";
import { useToast } from "../context/ToastContext";

const ACCEPTED = ".pdf,.docx,.txt";

export function ProjectDetail() {
  const params = useParams();
  const projectId = Number(params.id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, loading, error, reload } = useApiResource<ProjectDetailType>(
    () => api.get<ProjectDetailType>(`/projects/${projectId}`).then((response) => response.data),
    [projectId],
  );

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyDocument, setBusyDocument] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const documents = data?.documents ?? [];
  const hasProcessing = documents.some(
    (document) => document.processing_status === "pending" || document.processing_status === "processing",
  );

  useInterval(() => reload(), hasProcessing ? 2600 : null);

  if (!Number.isFinite(projectId)) {
    return <ErrorBanner message="Invalid project id." />;
  }
  if (loading && !data) return <Spinner label="Opening project workspace…" />;
  if (error && !data) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <Link to="/projects">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to projects
          </Button>
        </Link>
      </div>
    );
  }
  if (!data) return null;

  const overview = data.overview;
  const readiness = overview?.readiness_score ?? 0;
  const readyDocuments = data.ready_documents;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const suffix = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx", ".txt"].includes(suffix)) {
      toast("Only PDF, DOCX and TXT files are supported.", "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("project_id", String(projectId));
      form.append("file", file);
      await api.post("/documents/upload", form);
      toast("Upload accepted. Text extraction and indexing have started.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setUploading(false);
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const { data: result } = await api.post<{ engine: string }>("/ai/analyze-project", {
        project_id: projectId,
      });
      toast(
        result.engine === "gemini"
          ? "Project re-analysed with Gemini."
          : "Project re-analysed with the offline engine.",
        "success",
      );
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const reprocess = async (document: DocumentItem) => {
    setBusyDocument(document.id);
    try {
      await api.post(`/documents/${document.id}/reprocess`);
      toast("Document queued for reprocessing.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyDocument(null);
    }
  };

  const removeDocument = async (document: DocumentItem) => {
    if (!window.confirm(`Delete "${document.filename}" and its indexed chunks?`)) return;
    setBusyDocument(document.id);
    try {
      await api.delete(`/documents/${document.id}`);
      toast("Document deleted.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyDocument(null);
    }
  };

  const removeProject = async () => {
    if (
      !window.confirm(
        `Delete "${data.title}"? All documents, sessions, evaluations and recommendations for this project will be removed.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${projectId}`);
      toast("Project deleted.", "success");
      navigate("/projects", { replace: true });
    } catch (err) {
      toast(apiErrorMessage(err), "error");
      setDeleting(false);
    }
  };

  const openEdit = () => {
    setTitle(data.title);
    setDescription(data.description);
    setDomain(data.domain);
    setEditOpen(true);
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2) {
      toast("Title must be at least 2 characters.", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await api.patch(`/projects/${projectId}`, {
        title: title.trim(),
        description: description.trim(),
        domain: domain.trim(),
      });
      toast("Project details updated.", "success");
      setEditOpen(false);
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const readinessMissing = overview?.missing_information ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-600 dark:text-slate-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </Link>

      <PageHeader
        eyebrow={data.domain || "Project workspace"}
        title={data.title}
        description={data.description || "No description provided yet."}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={openEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              className="text-rose-500 hover:text-rose-600"
              loading={deleting}
              onClick={removeProject}
            >
              Delete
            </Button>
            <Link to={`/viva/new?project=${projectId}`}>
              <Button icon={<Play className="h-4 w-4" />} disabled={readyDocuments === 0}>
                Start mock viva
              </Button>
            </Link>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Report readiness"
            description="Readiness is computed from indexed text, extracted topics and required viva sections."
            action={
              <Badge tone={readiness >= 70 ? "emerald" : readiness >= 40 ? "amber" : "rose"}>
                {readiness >= 70 ? "Viva ready" : readiness >= 40 ? "Partially ready" : "Needs content"}
              </Badge>
            }
          />
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
            <ScoreRing score={readiness} size={118} label="readiness" />
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Documents", value: `${overview?.ready_documents ?? 0}/${data.document_count}` },
                  { label: "Pages", value: documents.reduce((sum, document) => sum + document.page_count, 0) },
                  { label: "Chunks", value: overview?.chunk_count ?? 0 },
                  { label: "Words", value: formatNumber(overview?.word_count ?? 0, 0) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-slate-50 p-2.5 text-center dark:bg-slate-950/40">
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">{stat.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
              <ProgressBar value={readiness} />
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {overview?.summary || "Upload a report to generate a project overview and knowledge base."}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Knowledge base" description="Upload a final report (PDF, DOCX or TXT)." />
          <div className="space-y-3 p-5">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={upload}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-7 text-center transition hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-brand-500"
            >
              <CloudUpload className="h-7 w-7 text-brand-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {uploading ? "Uploading…" : "Choose a report file"}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                PDF, DOCX or TXT · validated and stored privately
              </span>
            </button>
            <Button
              variant="secondary"
              className="w-full"
              icon={<Sparkles className="h-4 w-4" />}
              loading={analyzing}
              disabled={readyDocuments === 0}
              onClick={analyze}
            >
              Re-analyse project
            </Button>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Analysis uses Gemini when configured, otherwise the deterministic offline extractor. It never
              invents content that is not in your report.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Overview"
            description={overview?.llm_analysis ? "Enhanced by Gemini from grounded excerpts." : "Extracted deterministically from your report."}
          />
          <div className="space-y-5 p-5">
            <div>
              <SectionLabel icon={<ListChecks className="h-3.5 w-3.5" />}>Objectives</SectionLabel>
              <div className="mt-2">
                {overview?.objectives?.length ? (
                  <TickList items={overview.objectives.slice(0, 6)} />
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No objectives detected yet.</p>
                )}
              </div>
            </div>
            <Divider />
            <div>
              <SectionLabel icon={<Cpu className="h-3.5 w-3.5" />}>Technologies</SectionLabel>
              <div className="mt-2">
                <TopicChips topics={overview?.technologies ?? []} empty="No technologies detected yet." max={10} />
              </div>
            </div>
            <Divider />
            <div>
              <SectionLabel icon={<Target className="h-3.5 w-3.5" />}>Key components</SectionLabel>
              <div className="mt-2">
                <TopicChips topics={overview?.key_components ?? []} empty="No components detected yet." max={10} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Topics & sections" description="Used to target categories and follow-up questions." />
          <div className="space-y-5 p-5">
            <div>
              <SectionLabel icon={<Layers className="h-3.5 w-3.5" />}>Topics</SectionLabel>
              <div className="mt-2">
                <TopicChips topics={overview?.topics ?? []} empty="Upload a report to extract topics." max={12} />
              </div>
            </div>
            <Divider />
            <div>
              <SectionLabel icon={<BookOpenCheck className="h-3.5 w-3.5" />}>Detected sections</SectionLabel>
              <div className="mt-2">
                <TopicChips topics={overview?.sections ?? []} empty="No section headings detected." max={14} />
              </div>
            </div>
            {readinessMissing.length > 0 && (
              <>
                <Divider />
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <FileWarning className="h-3.5 w-3.5" /> Missing information
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-amber-700 dark:text-amber-200/90">
                    {readinessMissing.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Documents (${documents.length})`}
          description="Processing happens in the background. This page refreshes automatically while a file is being indexed."
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<CloudUpload className="h-4 w-4" />}
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Upload
            </Button>
          }
        />
        <div className="mt-4">
          {documents.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="No documents uploaded"
                description="Add your project report to build the question knowledge base."
                action={
                  <Button size="sm" onClick={() => fileInput.current?.click()} icon={<CloudUpload className="h-4 w-4" />}>
                    Upload report
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {documents.map((document) => (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{document.filename}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{document.file_type.toUpperCase()}</span>
                        <span>· {formatBytes(document.size_bytes)}</span>
                        <span>· {document.page_count} pages</span>
                        <span>· {document.chunk_count} chunks</span>
                        <span>· {formatDateTime(document.created_at)}</span>
                      </p>
                      {document.error_message && (
                        <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{document.error_message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DocumentStatusBadge status={document.processing_status} />
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Reprocess document"
                      aria-label={`Reprocess ${document.filename}`}
                      loading={busyDocument === document.id}
                      onClick={() => reprocess(document)}
                    >
                      {busyDocument === document.id ? null : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      title="Delete document"
                      aria-label={`Delete ${document.filename}`}
                      onClick={() => removeDocument(document)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent viva sessions"
          action={
            readyDocuments > 0 ? (
              <Link to={`/viva/new?project=${projectId}`}>
                <Button size="sm" variant="subtle" icon={<GraduationCap className="h-3.5 w-3.5" />}>
                  New session
                </Button>
              </Link>
            ) : undefined
          }
        />
        <div className="mt-4">
          {data.recent_sessions.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400">
              No sessions yet for this project.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.recent_sessions.map((session) => (
                <Link
                  key={session.id}
                  to={session.status === "completed" ? `/viva/${session.id}/report` : `/viva/${session.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <SessionStatusBadge status={session.status} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {session.difficulty} · {formatDate(session.started_at)}
                    </span>
                  </div>
                  <ScorePill score={session.overall_score} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        {readyDocuments > 0
          ? "This project is ready for a grounded mock viva."
          : "Upload and process at least one document to unlock mock vivas."}
        {overview?.generated_at && (
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Analysis generated {formatDate(overview.generated_at)}
          </span>
        )}
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-project-form" loading={savingEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-project-form" onSubmit={saveEdit} className="space-y-4">
          <Field label="Project title" htmlFor="edit-title">
            <Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} />
          </Field>
          <Field label="Domain" htmlFor="edit-domain">
            <Input id="edit-domain" value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={4000}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
