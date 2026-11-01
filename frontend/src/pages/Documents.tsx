import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  BookOpenCheck,
  CloudUpload,
  Eye,
  FileText,
  Filter,
  RefreshCw,
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
  Select,
  Spinner,
  StatCard,
} from "../components/UI";
import { DocumentStatusBadge } from "../components/Widgets";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource, useInterval } from "../lib/hooks";
import type { DocumentItem, Project } from "../lib/types";
import { formatBytes, formatDateTime, formatNumber } from "../lib/utils";
import { useToast } from "../context/ToastContext";

interface DocumentContent {
  id: number;
  filename: string;
  processing_status: string;
  page_count: number;
  word_count: number;
  chunk_count: number;
  sections: Array<{ name: string; chunks: number }>;
  chunks: Array<{ id: number; section: string; page_number: number; content: string }>;
}

export function Documents() {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, loading, error, reload } = useApiResource(
    async () => {
      const [documents, projects] = await Promise.all([
        api.get<DocumentItem[]>("/documents").then((response) => response.data),
        api.get<Project[]>("/projects").then((response) => response.data),
      ]);
      return { documents, projects };
    },
    [],
  );

  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProject, setUploadProject] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const documents = data?.documents ?? [];
  const projects = data?.projects ?? [];
  const hasProcessing = documents.some(
    (document) => document.processing_status === "pending" || document.processing_status === "processing",
  );

  useInterval(() => reload(), hasProcessing ? 2600 : null);

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title])),
    [projects],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (projectFilter && document.project_id !== Number(projectFilter)) return false;
      if (statusFilter && document.processing_status !== statusFilter) return false;
      if (!needle) return true;
      return `${document.filename} ${projectNames.get(document.project_id) ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [documents, projectFilter, statusFilter, query, projectNames]);

  const counts = useMemo(
    () => ({
      total: documents.length,
      ready: documents.filter((document) => document.processing_status === "ready").length,
      processing: documents.filter(
        (document) => document.processing_status === "pending" || document.processing_status === "processing",
      ).length,
      failed: documents.filter((document) => document.processing_status === "failed").length,
    }),
    [documents],
  );

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!uploadProject) {
      toast("Select a project before uploading.", "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("project_id", uploadProject);
      form.append("file", file);
      await api.post("/documents/upload", form);
      toast("Document uploaded. Processing started in the background.", "success");
      setUploadOpen(false);
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setUploading(false);
    }
  };

  const reprocess = async (document: DocumentItem) => {
    setBusyId(document.id);
    try {
      await api.post(`/documents/${document.id}/reprocess`);
      toast("Reprocessing queued.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (document: DocumentItem) => {
    if (!window.confirm(`Delete "${document.filename}"? This removes its indexed chunks from the knowledge base.`))
      return;
    setBusyId(document.id);
    try {
      await api.delete(`/documents/${document.id}`);
      toast("Document deleted.", "success");
      reload();
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const viewContent = async (document: DocumentItem) => {
    setContentLoading(true);
    setContent(null);
    try {
      const { data: documentContent } = await api.get<DocumentContent>(`/documents/${document.id}/content`);
      setContent(documentContent);
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setContentLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Every uploaded report, its validation status and the indexed chunks used for grounded questioning."
        actions={
          <Button
            icon={<CloudUpload className="h-4 w-4" />}
            onClick={() => {
              setUploadProject(projectFilter || String(projects[0]?.id ?? ""));
              setUploadOpen(true);
            }}
            disabled={projects.length === 0}
          >
            Upload document
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {projects.length === 0 && !loading ? (
        <EmptyState
          icon={<BookOpenCheck className="h-6 w-6" />}
          title="Create a project first"
          description="Documents belong to a project, which keeps the knowledge base isolated and secure."
          action={
            <Link to="/projects">
              <Button>Create a project</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Documents" value={counts.total} hint="Across all projects" icon={<FileText className="h-5 w-5" />} />
            <StatCard label="Indexed" value={counts.ready} hint="Ready for viva questions" icon={<BookOpenCheck className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Processing" value={counts.processing} hint="Auto-refreshing" icon={<RefreshCw className="h-5 w-5" />} tone="sky" />
            <StatCard label="Failed" value={counts.failed} hint="Need reprocessing" icon={<Filter className="h-5 w-5" />} tone="rose" />
          </div>

          <Card>
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by filename or project"
                  className="pl-9"
                  aria-label="Search documents"
                />
              </div>
              <Select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className="lg:w-56"
                aria-label="Filter by project"
              >
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="lg:w-44"
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="failed">Failed</option>
              </Select>
            </div>

            {loading && !data ? (
              <Spinner label="Loading documents…" />
            ) : filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<FileText className="h-5 w-5" />}
                  title={documents.length === 0 ? "No documents yet" : "No documents match your filters"}
                  description={
                    documents.length === 0
                      ? "Upload a PDF, DOCX or TXT report to create your knowledge base."
                      : "Clear the search or choose a different project/status."
                  }
                  action={
                    documents.length === 0 ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setUploadProject(projectFilter || String(projects[0]?.id ?? ""));
                          setUploadOpen(true);
                        }}
                      >
                        Upload document
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((document) => (
                  <div key={document.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{document.filename}</p>
                          <DocumentStatusBadge status={document.processing_status} />
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <Link
                            to={`/projects/${document.project_id}`}
                            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            {projectNames.get(document.project_id) ?? `Project #${document.project_id}`}
                          </Link>
                          <span>· {document.file_type.toUpperCase()}</span>
                          <span>· {formatBytes(document.size_bytes)}</span>
                          <span>· {document.page_count} pages</span>
                          <span>· {formatNumber(document.word_count, 0)} words</span>
                          <span>· {document.chunk_count} chunks</span>
                          <span>· {formatDateTime(document.created_at)}</span>
                        </p>
                        {document.error_message && (
                          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{document.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye className="h-4 w-4" />}
                        disabled={document.processing_status !== "ready"}
                        onClick={() => viewContent(document)}
                      >
                        View
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Reprocess ${document.filename}`}
                        loading={busyId === document.id}
                        onClick={() => reprocess(document)}
                      >
                        {busyId === document.id ? null : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600"
                        aria-label={`Delete ${document.filename}`}
                        onClick={() => remove(document)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        description="Files are validated by extension, size and content. Processing runs in the background."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={uploading}
              disabled={!uploadProject}
              icon={<CloudUpload className="h-4 w-4" />}
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Project" htmlFor="upload-project" hint="The document is indexed only for this project.">
            <Select
              id="upload-project"
              value={uploadProject}
              onChange={(event) => setUploadProject(event.target.value)}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
          </Field>
          <input ref={fileInput} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={upload} />
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
            <CloudUpload className="mx-auto h-7 w-7 text-brand-500" />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {uploading ? "Uploading and queuing…" : "PDF, DOCX or TXT up to the configured size limit"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use the final report for the best question quality.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
            <Badge tone="emerald">Private per user</Badge>
            <Badge tone="sky">Section-aware chunking</Badge>
            <Badge tone="violet">Vector indexed</Badge>
          </div>
        </div>
      </Modal>

      <Modal
        open={contentLoading || content !== null}
        onClose={() => setContent(null)}
        title={content?.filename ?? "Document content"}
        description="Extracted text chunks with section and page attribution."
        size="lg"
      >
        {contentLoading ? (
          <Spinner label="Loading extracted content…" />
        ) : content ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="slate">{content.page_count} pages</Badge>
              <Badge tone="slate">{formatNumber(content.word_count, 0)} words</Badge>
              <Badge tone="slate">{content.chunk_count} chunks</Badge>
            </div>
            {content.sections.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sections</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {content.sections.map((section) => (
                    <span
                      key={section.name}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {section.name} · {section.chunks}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {content.chunks.slice(0, 60).map((chunk) => (
                <div key={chunk.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <span>Chunk {chunk.id}</span>
                    {chunk.section && <span>· {chunk.section}</span>}
                    {chunk.page_number != null && <span>· page {chunk.page_number}</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
            {content.chunks.length > 60 && (
              <p className="text-[11px] text-slate-400">
                Showing the first 60 of {content.chunks.length} chunks. The examiner can retrieve all of them.
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
