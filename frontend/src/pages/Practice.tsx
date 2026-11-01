import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Layers,
  Lightbulb,
  PenLine,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wand2,
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
  Textarea,
} from "../components/UI";
import { EvaluationPanel } from "../components/EvaluationPanel";
import { DifficultyBadge, SectionLabel } from "../components/Widgets";
import { SpeakButton, VoiceRecorder } from "../components/VoiceRecorder";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { Evaluation, GeneratedQuestion, Project, SourceReference } from "../lib/types";
import { CATEGORIES, DIFFICULTY_OPTIONS, cn, formatNumber } from "../lib/utils";
import { useToast } from "../context/ToastContext";

interface GenerateResponse {
  project_id: number;
  engine: string;
  questions: GeneratedQuestion[];
}

const PRACTICE_CATEGORIES = CATEGORIES.filter((category) => category !== "Project Introduction");

export function Practice() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const projects = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );
  const readyProjects = useMemo(
    () => (projects.data ?? []).filter((project) => project.ready_documents > 0),
    [projects.data],
  );

  const initialProject = Number(searchParams.get("project") ?? "");
  const initialQuestion = searchParams.get("question") ?? "";
  const initialTopic = searchParams.get("topic") ?? "";

  const [projectId, setProjectId] = useState(() =>
    Number.isFinite(initialProject) && initialProject > 0 ? initialProject : 0,
  );
  const [mode, setMode] = useState<"generated" | "custom">(initialQuestion ? "custom" : "generated");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [count, setCount] = useState(3);
  const [categories, setCategories] = useState<string[]>([...PRACTICE_CATEGORIES]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [engine, setEngine] = useState("");
  const [current, setCurrent] = useState(0);

  const [customQuestion, setCustomQuestion] = useState(initialQuestion);
  const [customCategory, setCustomCategory] = useState(
    initialTopic && (CATEGORIES as readonly string[]).includes(initialTopic) ? initialTopic : "Technical Concepts",
  );

  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState("");

  useEffect(() => {
    if (projectId || readyProjects.length === 0) return;
    setProjectId(readyProjects[0].id);
  }, [projectId, readyProjects]);

  const selectedProject = readyProjects.find((project) => project.id === projectId) ?? null;
  const activeQuestion: GeneratedQuestion | null =
    mode === "generated" ? (questions[current] ?? null) : null;

  const questionText =
    mode === "generated" ? activeQuestion?.question ?? "" : customQuestion.trim();
  const activeCategory = mode === "generated" ? activeQuestion?.category ?? "Technical Concepts" : customCategory;
  const activeDifficulty = mode === "generated" ? activeQuestion?.difficulty ?? difficulty : difficulty === "mixed" ? "intermediate" : difficulty;
  const expectedAnswer = mode === "generated" ? activeQuestion?.expected_answer ?? "" : "";
  const sourceReference: SourceReference | undefined =
    mode === "generated" ? activeQuestion?.source_reference : undefined;

  const allCategoriesSelected = categories.length === PRACTICE_CATEGORIES.length;

  const toggleCategory = (category: string) => {
    setCategories((currentList) =>
      currentList.includes(category)
        ? currentList.filter((item) => item !== category)
        : [...currentList, category],
    );
  };

  const resetAnswer = () => {
    setAnswer("");
    setEvaluation(null);
    setEvaluationError("");
  };

  const generate = async () => {
    if (!selectedProject) {
      setGenerateError("Choose a project with at least one indexed document.");
      return;
    }
    if (categories.length === 0) {
      setGenerateError("Select at least one category.");
      return;
    }
    setGenerating(true);
    setGenerateError("");
    try {
      const { data } = await api.post<GenerateResponse>("/ai/generate-questions", {
        project_id: selectedProject.id,
        difficulty,
        count,
        categories: allCategoriesSelected ? [] : categories,
      });
      setQuestions(data.questions);
      setEngine(data.engine);
      setCurrent(0);
      setMode("generated");
      resetAnswer();
      toast(`${data.questions.length} practice question(s) generated.`, "success");
    } catch (err) {
      const message = apiErrorMessage(err);
      setGenerateError(message);
      toast(message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const evaluate = async () => {
    if (!selectedProject) {
      setEvaluationError("Choose a project before evaluating.");
      return;
    }
    if (questionText.trim().length < 5) {
      setEvaluationError("Write or select a question first.");
      return;
    }
    if (answer.trim().length === 0) {
      setEvaluationError("Write or dictate an answer before submitting.");
      return;
    }
    setEvaluating(true);
    setEvaluationError("");
    try {
      const { data } = await api.post<Evaluation>("/evaluation/evaluate", {
        project_id: selectedProject.id,
        question: questionText,
        answer: answer.trim(),
        expected_answer: expectedAnswer,
        category: activeCategory,
        difficulty: activeDifficulty,
      });
      setEvaluation(data);
      toast("Answer evaluated. Review the criterion breakdown below.", "success");
    } catch (err) {
      const message = apiErrorMessage(err);
      setEvaluationError(message);
      toast(message, "error");
    } finally {
      setEvaluating(false);
    }
  };

  if (projects.loading && !projects.data) return <Spinner label="Loading your projects…" />;

  if (readyProjects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Question practice"
          title="Practise one answer at a time"
          description="Generate project-grounded questions and get criterion-level feedback without starting a full viva."
        />
        {projects.error && <ErrorBanner message={projects.error} onRetry={projects.reload} />}
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No indexed document yet"
          description="Practice questions are grounded in your report. Create a project, upload a PDF/DOCX/TXT and wait for indexing."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/projects">
                <Button variant="secondary">Open projects</Button>
              </Link>
              <Link to="/documents">
                <Button icon={<BookOpen className="h-4 w-4" />}>Upload document</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Question practice"
        title="Practise one answer at a time"
        description="Generate project-grounded questions and get criterion-level feedback. Voice dictation fills the answer box and is evaluated exactly like typed text."
        actions={
          <Link to="/viva/new">
            <Button variant="secondary" icon={<BrainCircuit className="h-4 w-4" />}>
              Full mock viva
            </Button>
          </Link>
        }
      />

      {projects.error && <ErrorBanner message={projects.error} onRetry={projects.reload} />}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Practice setup" description="Questions come only from your indexed project report." />
            <div className="space-y-4 p-5">
              <Field label="Project" htmlFor="practice-project">
                <Select
                  id="practice-project"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(Number(event.target.value));
                    setQuestions([]);
                    resetAnswer();
                  }}
                >
                  {readyProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Difficulty" htmlFor="practice-difficulty">
                  <Select
                    id="practice-difficulty"
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value)}
                  >
                    {DIFFICULTY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Questions" htmlFor="practice-count">
                  <Select
                    id="practice-count"
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  >
                    {[1, 2, 3, 5, 8].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Categories</span>
                  <button
                    type="button"
                    onClick={() => setCategories(allCategoriesSelected ? [] : [...PRACTICE_CATEGORIES])}
                    className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {allCategoriesSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  {PRACTICE_CATEGORIES.map((category) => {
                    const active = categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[10px] font-semibold transition",
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
              </div>

              {generateError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {generateError}
                </p>
              )}

              <Button
                className="w-full"
                icon={<Wand2 className="h-4 w-4" />}
                loading={generating}
                onClick={generate}
                disabled={categories.length === 0}
              >
                Generate questions
              </Button>
            </div>
          </Card>

          {questions.length > 0 && (
            <Card>
              <CardHeader
                title="Question bank"
                description="Select any generated question to answer it."
                action={<Badge tone={engine === "gemini" ? "violet" : "emerald"}>{engine || "offline"}</Badge>}
              />
              <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto p-3">
                {questions.map((question, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setMode("generated");
                      setCurrent(index);
                      resetAnswer();
                    }}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition",
                      index === current && mode === "generated"
                        ? "border-brand-500 bg-brand-50/70 dark:border-brand-400 dark:bg-brand-500/10"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Q{index + 1} · {question.category}
                      </span>
                      <span className="text-[10px] text-slate-400">{question.difficulty}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {question.question}
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Answer structure that scores well
            </p>
            <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <li>1. Define the concept in one sentence.</li>
              <li>2. Explain how it works in your project.</li>
              <li>3. Give a concrete implementation or result.</li>
              <li>4. Name one limitation or trade-off.</li>
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode("generated");
                    resetAnswer();
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    mode === "generated"
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                  )}
                >
                  <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Generated
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("custom");
                    resetAnswer();
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    mode === "custom"
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                  )}
                >
                  <PenLine className="mr-1 inline h-3.5 w-3.5" /> My question
                </button>
              </div>
              {mode === "generated" && questions.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge tone="slate">
                    {current + 1} / {questions.length}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setCurrent((index) => (index + 1) % questions.length);
                      resetAnswer();
                    }}
                  >
                    Next question
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-5 p-5">
              {mode === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                  <Field label="Your question" htmlFor="custom-question">
                    <Textarea
                      id="custom-question"
                      rows={3}
                      value={customQuestion}
                      onChange={(event) => {
                        setCustomQuestion(event.target.value);
                        setEvaluation(null);
                      }}
                      placeholder="e.g. Explain how your model handles missing data."
                      maxLength={2000}
                    />
                  </Field>
                  <Field label="Category" htmlFor="custom-category">
                    <Select
                      id="custom-category"
                      value={customCategory}
                      onChange={(event) => setCustomCategory(event.target.value)}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : questions.length === 0 ? (
                <EmptyState
                  icon={<Wand2 className="h-6 w-6" />}
                  title="Generate your first practice questions"
                  description="Choose a project, difficulty and categories, then generate questions grounded in your report. You can also write your own question."
                  action={
                    <Button icon={<Wand2 className="h-4 w-4" />} loading={generating} onClick={generate}>
                      Generate questions
                    </Button>
                  }
                />
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{activeCategory}</Badge>
                    <DifficultyBadge difficulty={activeDifficulty} />
                    {activeQuestion?.engine && <Badge tone="slate">{activeQuestion.engine}</Badge>}
                  </div>
                  <h2 className="mt-3 text-lg font-bold leading-relaxed text-slate-900 dark:text-white">
                    {activeQuestion?.question}
                  </h2>
                  {sourceReference && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
                        <FileText className="h-3.5 w-3.5" /> Grounded in {sourceReference.filename ?? "your report"}
                        {sourceReference.page_number != null && ` · p.${sourceReference.page_number}`}
                      </p>
                      {sourceReference.snippet && (
                        <p className="mt-1 line-clamp-2 leading-relaxed text-slate-500 dark:text-slate-400">
                          {sourceReference.snippet}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3">
                    <SpeakButton text={activeQuestion?.question ?? ""} label="Read question aloud" />
                  </div>
                </div>
              )}

              {(questionText || mode === "custom") && (
                <>
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Your answer</span>
                      <span className="text-[11px] text-slate-400">
                        {answer.trim() ? `${answer.trim().split(/\s+/).length} words` : "Aim for 80–180 words"}
                      </span>
                    </div>
                    <Textarea
                      rows={9}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Define the concept, explain the mechanism in your project, cite evidence, then state a limitation…"
                      maxLength={12000}
                      aria-label="Your answer"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <VoiceRecorder
                        onTranscript={(text) =>
                          setAnswer((currentAnswer) =>
                            currentAnswer.trim() ? `${currentAnswer.trim()} ${text}` : text,
                          )
                        }
                        disabled={evaluating}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RotateCcw className="h-3.5 w-3.5" />}
                          onClick={resetAnswer}
                          disabled={!answer && !evaluation}
                        >
                          Reset
                        </Button>
                        <Button
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          loading={evaluating}
                          onClick={evaluate}
                          disabled={!questionText.trim() || !answer.trim()}
                        >
                          Evaluate answer
                        </Button>
                      </div>
                    </div>
                  </div>

                  {evaluationError && <ErrorBanner message={evaluationError} />}

                  {!evaluation && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="flex items-start gap-2.5">
                        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Scoring follows the platform formula
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            Technical accuracy 30% · relevance 20% · completeness 20% · conceptual understanding 20%
                            · clarity 10%. Empty, vague or very short answers are capped.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {evaluation && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                  Feedback for “{activeCategory}”
                </SectionLabel>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {formatNumber(evaluation.total_score)}/100
                </span>
              </div>
              <ProgressBar value={evaluation.total_score} />
              <EvaluationPanel evaluation={evaluation} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">
                  Stored evaluations feed your analytics, weak topics and recommendations.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={resetAnswer}>
                    Try another answer
                  </Button>
                  <Link to="/analytics">
                    <Button size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                      View analytics
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Practice;
