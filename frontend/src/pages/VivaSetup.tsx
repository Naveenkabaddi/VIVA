import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  Clock,
  FileStack,
  GraduationCap,
  Info,
  Layers,
  Mic,
  Play,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  ProgressBar,
  Select,
  Spinner,
} from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { Project, StartVivaResponse } from "../lib/types";
import { CATEGORIES, DIFFICULTY_OPTIONS, cn } from "../lib/utils";

const DIFFICULTY_HELP: Record<string, string> = {
  basic: "Definitions, overview and straightforward project facts.",
  intermediate: "Mechanisms, design choices and evidence from the report.",
  advanced: "Trade-offs, failure modes and deep technical defence.",
  mixed: "Adaptive mix, starting from your selected default.",
};

export function VivaSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselected = Number(searchParams.get("project") ?? "");

  const { data, loading, error, reload } = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );

  const readyProjects = useMemo(
    () => (data ?? []).filter((project) => project.ready_documents > 0),
    [data],
  );

  const [projectId, setProjectId] = useState(() =>
    Number.isFinite(preselected) && preselected > 0 ? preselected : 0,
  );
  const [difficulty, setDifficulty] = useState<string>(user?.default_difficulty ?? "mixed");
  const [duration, setDuration] = useState(20);
  const [questionCount, setQuestionCount] = useState(8);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const selectedProject =
    readyProjects.find((project) => project.id === projectId) ?? readyProjects[0] ?? null;
  const effectiveProjectId = selectedProject?.id ?? 0;
  const allCategories = categories.length === CATEGORIES.length;

  const toggleCategory = (category: string) => {
    setCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  };

  const start = async () => {
    if (!effectiveProjectId) {
      setStartError("Choose a project with at least one indexed document.");
      return;
    }
    if (categories.length === 0) {
      setStartError("Select at least one question category.");
      return;
    }
    setStarting(true);
    setStartError("");
    try {
      const { data: response } = await api.post<StartVivaResponse>("/viva/start", {
        project_id: effectiveProjectId,
        difficulty,
        duration_minutes: duration,
        question_count: questionCount,
        mode,
        categories: allCategories ? [] : categories,
      });
      toast("Viva started. The examiner is ready.", "success");
      navigate(`/viva/${response.session.id}`, { replace: true });
    } catch (err) {
      const message = apiErrorMessage(err);
      setStartError(message);
      toast(message, "error");
    } finally {
      setStarting(false);
    }
  };

  if (loading && !data) return <Spinner label="Loading your projects…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mock viva"
        title="Configure your examiner"
        description="Questions are generated from your indexed report, then adapt to the quality and gaps in your answers."
        actions={
          <Link to="/documents">
            <Button variant="secondary" icon={<BookOpenCheck className="h-4 w-4" />}>
              Manage documents
            </Button>
          </Link>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {startError && <ErrorBanner message={startError} />}

      {readyProjects.length === 0 ? (
        <EmptyState
          icon={<FileStack className="h-6 w-6" />}
          title="No project is ready yet"
          description={
            (data ?? []).length === 0
              ? "Create a project and upload a report before starting a mock viva."
              : "Your projects exist, but none has a processed document yet. Upload a PDF, DOCX or TXT report and wait for indexing."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/projects">
                <Button variant="secondary">Open projects</Button>
              </Link>
              <Link to="/documents">
                <Button icon={<BookOpenCheck className="h-4 w-4" />}>Upload document</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Card>
              <CardHeader title="1. Choose a project" description="Only projects with at least one indexed document are shown." />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {readyProjects.map((project) => {
                  const active = project.id === effectiveProjectId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setProjectId(project.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition",
                        active
                          ? "border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20 dark:border-brand-400 dark:bg-brand-500/10"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{project.title}</span>
                        <Badge tone="emerald">{project.ready_documents} ready</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {project.description || "No description."}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <span>{project.session_count} sessions</span>
                        {project.latest_score !== null && <span>· best {Math.round(project.latest_score)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title="2. Session settings" description="You can pause or end at any time." />
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                <Field label="Difficulty" htmlFor="difficulty" hint={DIFFICULTY_HELP[difficulty]}>
                  <Select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Answer mode" htmlFor="mode" hint="Voice mode adds dictation and read-aloud tools.">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "text" as const, label: "Text", icon: Target },
                      { value: "voice" as const, label: "Voice", icon: Mic },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMode(option.value)}
                        className={cn(
                          "flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition",
                          mode === option.value
                            ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                      >
                        <option.icon className="h-4 w-4" /> {option.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Duration</span>
                    <span className="text-brand-600 dark:text-brand-400">{duration} minutes</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="mt-3 w-full accent-brand-600"
                    aria-label="Session duration in minutes"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>5 min</span>
                    <span>60 min</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Questions</span>
                    <span className="text-brand-600 dark:text-brand-400">{questionCount}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={questionCount}
                    onChange={(event) => setQuestionCount(Number(event.target.value))}
                    className="mt-3 w-full accent-brand-600"
                    aria-label="Number of questions"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>3</span>
                    <span>20</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="3. Question categories"
                description="All categories are selected by default. Remove any you do not want examined."
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCategories(allCategories ? [] : [...CATEGORIES])}
                  >
                    {allCategories ? "Clear all" : "Select all"}
                  </Button>
                }
              />
              <div className="flex flex-wrap gap-2 p-5">
                {CATEGORIES.map((category) => {
                  const active = categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
              {categories.length === 0 && (
                <p className="px-5 pb-5 text-xs text-rose-600 dark:text-rose-400">
                  Select at least one category to start.
                </p>
              )}
            </Card>
          </div>

          <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-brand-600 to-violet-600 p-5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">Ready to begin</p>
                <h3 className="mt-1 text-lg font-extrabold">{selectedProject?.title ?? "Select a project"}</h3>
                <p className="mt-1 text-xs text-white/75">{DIFFICULTY_HELP[difficulty]}</p>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
                    <Clock className="mx-auto h-4 w-4 text-slate-400" />
                    <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{duration} min</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Duration</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40">
                    <Layers className="mx-auto h-4 w-4 text-slate-400" />
                    <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{questionCount}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Questions</p>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-slate-400" /> Difficulty
                    </span>
                    <Badge tone="brand">{difficulty}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      {mode === "voice" ? <Mic className="h-3.5 w-3.5 text-slate-400" /> : <Target className="h-3.5 w-3.5 text-slate-400" />}
                      Answer mode
                    </span>
                    <Badge tone={mode === "voice" ? "violet" : "slate"}>{mode}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-slate-400" /> Categories
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {allCategories ? "All 14" : categories.length}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Project readiness</span>
                    <span>{selectedProject?.ready_documents ?? 0} documents</span>
                  </div>
                  <ProgressBar value={selectedProject ? Math.min(100, selectedProject.ready_documents * 40) : 0} />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  icon={<Play className="h-4 w-4" />}
                  loading={starting}
                  disabled={!selectedProject || categories.length === 0}
                  onClick={start}
                >
                  Start mock viva
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Info className="h-3.5 w-3.5 text-brand-500" /> What to expect
              </p>
              <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                <li className="flex gap-1.5">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
                  Every answer is scored on accuracy, relevance, completeness, understanding and clarity.
                </li>
                <li className="flex gap-1.5">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
                  Weak or exceptionally strong answers can trigger an adaptive follow-up question.
                </li>
                {mode === "voice" && (
                  <li className="flex gap-1.5">
                    <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
                    Voice mode uses browser dictation and read-aloud. The transcript is evaluated exactly like typed text.
                  </li>
                )}
                <li className="flex gap-1.5">
                  <GraduationCap className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  The session ends after all questions or when the time limit is reached, and a report is generated.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
