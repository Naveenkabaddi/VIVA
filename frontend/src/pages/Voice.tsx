import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AudioLines,
  BookOpen,
  CheckCircle2,
  CircleStop,
  FileText,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  Wand2,
  Waves,
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
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import { speechRecognitionSupported, speechSynthesisSupported } from "../lib/speech";
import type { Evaluation, GeneratedQuestion, Project, VoiceCapabilities } from "../lib/types";
import { DIFFICULTY_OPTIONS, cn, formatNumber } from "../lib/utils";

interface GenerateResponse {
  project_id: number;
  engine: string;
  questions: GeneratedQuestion[];
}

interface TranscribeResponse {
  text: string;
  provider: string;
  language?: string;
  duration_seconds?: number;
}

function ServerAudioRecorder({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stopTracks();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setError("No audio was captured. Try again and speak clearly.");
          return;
        }
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("file", blob, "answer.webm");
          form.append("language", "en");
          const { data } = await api.post<TranscribeResponse>("/voice/transcribe", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          if (data.text?.trim()) onTranscript(data.text.trim());
          else setError("The transcriber returned no text. Speak a little longer.");
        } catch (err) {
          setError(apiErrorMessage(err));
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone permission was denied or no microphone is available.");
      stopTracks();
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      setRecording(false);
      stopTracks();
    }
  };

  if (!supported) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <Button variant="danger" size="sm" icon={<CircleStop className="h-4 w-4" />} onClick={stop}>
            Stop &amp; transcribe
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
            onClick={start}
            disabled={disabled || transcribing}
          >
            {transcribing ? "Transcribing…" : "Record audio for server transcription"}
          </Button>
        )}
        {recording && (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Recording…
          </span>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export function VoicePractice() {
  const { toast } = useToast();
  const projects = useApiResource<Project[]>(
    () => api.get<Project[]>("/projects").then((response) => response.data),
    [],
  );
  const capabilities = useApiResource<VoiceCapabilities>(
    () => api.get<VoiceCapabilities>("/voice/capabilities").then((response) => response.data),
    [],
  );

  const readyProjects = useMemo(
    () => (projects.data ?? []).filter((project) => project.ready_documents > 0),
    [projects.data],
  );

  const [projectId, setProjectId] = useState(0);
  const [difficulty, setDifficulty] = useState("intermediate");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [engine, setEngine] = useState("");
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState("");

  useEffect(() => {
    if (projectId || readyProjects.length === 0) return;
    setProjectId(readyProjects[0].id);
  }, [projectId, readyProjects]);

  const selectedProject = readyProjects.find((project) => project.id === projectId) ?? null;
  const serverSttAvailable = Boolean(
    capabilities.data &&
      (capabilities.data.speech_to_text.local_whisper || capabilities.data.speech_to_text.gemini_audio),
  );

  const generate = async () => {
    if (!selectedProject) {
      setGenerateError("Choose a project with an indexed document first.");
      return;
    }
    setGenerating(true);
    setGenerateError("");
    setEvaluation(null);
    setAnswer("");
    try {
      const { data } = await api.post<GenerateResponse>("/ai/generate-questions", {
        project_id: selectedProject.id,
        difficulty: difficulty === "mixed" ? "intermediate" : difficulty,
        count: 1,
        categories: [],
      });
      const first = data.questions[0] ?? null;
      setQuestion(first);
      setEngine(data.engine);
      if (!first) toast("No question could be generated from this document.", "info");
    } catch (err) {
      const message = apiErrorMessage(err);
      setGenerateError(message);
      toast(message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const evaluate = async () => {
    if (!selectedProject || !question) return;
    if (!answer.trim()) {
      setEvaluationError("Speak or type an answer before evaluating.");
      return;
    }
    setEvaluating(true);
    setEvaluationError("");
    try {
      const { data } = await api.post<Evaluation>("/evaluation/evaluate", {
        project_id: selectedProject.id,
        question: question.question,
        answer: answer.trim(),
        expected_answer: question.expected_answer,
        category: question.category,
        difficulty: question.difficulty === "mixed" ? "intermediate" : question.difficulty,
      });
      setEvaluation(data);
      toast("Voice answer evaluated. Compare it with the model answer.", "success");
    } catch (err) {
      const message = apiErrorMessage(err);
      setEvaluationError(message);
      toast(message, "error");
    } finally {
      setEvaluating(false);
    }
  };

  if (projects.loading && !projects.data) return <Spinner label="Preparing your voice practice studio…" />;

  if (readyProjects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Voice practice"
          title="Answer aloud, like a real viva"
          description="Speak your answer, get a transcript and receive the same evidence-based evaluation as typed answers."
        />
        {projects.error && <ErrorBanner message={projects.error} onRetry={projects.reload} />}
        <EmptyState
          icon={<Mic className="h-6 w-6" />}
          title="No indexed report yet"
          description="Voice questions are grounded in your project report. Upload and process a document first."
          action={
            <Link to="/documents">
              <Button icon={<BookOpen className="h-4 w-4" />}>Upload document</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Voice practice"
        title="Answer aloud, like a real viva"
        description="Speak naturally, review the transcript, then submit. The transcript enters the normal evaluation pipeline — voice never bypasses scoring."
        actions={
          <Link to="/viva/new">
            <Button variant="secondary" icon={<MicrophoneIcon />}>
              Full voice viva
            </Button>
          </Link>
        }
      />

      {projects.error && <ErrorBanner message={projects.error} onRetry={projects.reload} />}
      {capabilities.error && <ErrorBanner message={capabilities.error} onRetry={capabilities.reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Mic className="h-3 w-3" /> Browser dictation
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {speechRecognitionSupported() ? "Available" : "Not available"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {speechRecognitionSupported()
              ? "Speech is transcribed in the browser, then evaluated server-side."
              : "Use Chrome or Edge, or type your answer instead."}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Volume2 className="h-3 w-3" /> Read aloud
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {speechSynthesisSupported() ? "Browser TTS" : "Unavailable"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Questions and feedback can be spoken with the device voice.
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Waves className="h-3 w-3" /> Server transcription
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {capabilities.loading ? "Checking…" : serverSttAvailable ? "Available" : "Not configured"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {serverSttAvailable
              ? "Recorded audio can be transcribed by the configured server provider."
              : "Whisper/Gemini audio is not installed; browser dictation still works."}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Sparkles className="h-3 w-3" /> Engine
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            {engine === "gemini" ? "Gemini" : engine ? "Offline exam" : "Not generated"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Every evaluation uses the weighted five-criterion formula.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Session setup" description="One question at a time, just like a viva." />
            <div className="space-y-4 p-5">
              <Field label="Project" htmlFor="voice-project">
                <Select
                  id="voice-project"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(Number(event.target.value));
                    setQuestion(null);
                    setEvaluation(null);
                    setAnswer("");
                  }}
                >
                  {readyProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" htmlFor="voice-difficulty">
                <Select
                  id="voice-difficulty"
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
              >
                {question ? "Ask another question" : "Ask me a question"}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionLabel icon={<Lightbulb className="h-3.5 w-3.5" />}>Speak like an examiner is present</SectionLabel>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {[
                "Start with a direct one-sentence answer.",
                "Explain the mechanism with a project-specific example.",
                "Say numbers and evidence aloud — ‘the model reached 92% accuracy’.",
                "Finish with a limitation or trade-off.",
                "Review the transcript before submitting; correct obvious dictation errors.",
              ].map((item) => (
                <li key={item} className="flex gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionLabel icon={<Volume2 className="h-3.5 w-3.5" />}>Voice stack</SectionLabel>
            <div className="mt-3 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <span>Speech to text provider</span>
                <Badge tone={serverSttAvailable ? "emerald" : "slate"}>
                  {capabilities.data?.speech_to_text.provider ?? "browser"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Text to speech provider</span>
                <Badge tone={capabilities.data?.text_to_speech.gtts ? "emerald" : "slate"}>
                  {capabilities.data?.text_to_speech.provider ?? "browser"}
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 bg-gradient-to-r from-brand-50 to-violet-50 px-5 py-4 dark:border-slate-800 dark:from-brand-500/10 dark:to-violet-500/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">
                    <Mic className="h-3 w-3" /> Voice answer
                  </Badge>
                  {question && <Badge tone="slate">{question.category}</Badge>}
                  {question && <DifficultyBadge difficulty={question.difficulty} />}
                </div>
                {question && <SpeakButton text={question.question} label="Read question" />}
              </div>
              {question ? (
                <h2 className="mt-3 text-lg font-bold leading-relaxed text-slate-900 dark:text-white sm:text-xl">
                  {question.question}
                </h2>
              ) : (
                <div className="py-8 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400">
                    <Mic className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">The examiner is waiting</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Ask for a question, then answer aloud. You can dictate or type.
                  </p>
                  <Button className="mt-4" icon={<Play className="h-4 w-4" />} loading={generating} onClick={generate}>
                    Ask me a question
                  </Button>
                </div>
              )}
            </div>

            {question && (
              <div className="space-y-4 p-5">
                {question.source_reference && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
                      <FileText className="h-3.5 w-3.5" /> Grounded in{" "}
                      {question.source_reference.filename ?? "your report"}
                      {question.source_reference.page_number != null && ` · p.${question.source_reference.page_number}`}
                    </p>
                    {question.source_reference.snippet && (
                      <p className="mt-1 line-clamp-2 leading-relaxed text-slate-500 dark:text-slate-400">
                        {question.source_reference.snippet}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Transcript / answer
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {answer.trim() ? `${answer.trim().split(/\s+/).length} words` : "Speak or type your answer"}
                    </span>
                  </div>
                  <Textarea
                    rows={9}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Press ‘Answer by voice’, speak naturally, then review the transcript here…"
                    maxLength={12000}
                    aria-label="Voice answer transcript"
                  />
                  <div className="mt-2 space-y-2">
                    <VoiceRecorder
                      onTranscript={(text) =>
                        setAnswer((current) => (current.trim() ? `${current.trim()} ${text}` : text))
                      }
                      disabled={evaluating}
                    />
                    {serverSttAvailable && (
                      <ServerAudioRecorder
                        disabled={evaluating}
                        onTranscript={(text) =>
                          setAnswer((current) => (current.trim() ? `${current.trim()} ${text}` : text))
                        }
                      />
                    )}
                    {!speechRecognitionSupported() && !serverSttAvailable && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MicOff className="h-3.5 w-3.5" /> Voice is unavailable in this browser — type your answer
                        instead; evaluation is identical.
                      </p>
                    )}
                  </div>
                </div>

                {evaluationError && <ErrorBanner message={evaluationError} />}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setAnswer("");
                      setEvaluation(null);
                      setEvaluationError("");
                    }}
                    disabled={!answer && !evaluation}
                  >
                    Clear answer
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Wand2 className="h-3.5 w-3.5" />}
                      loading={generating}
                      onClick={generate}
                    >
                      New question
                    </Button>
                    <Button
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      loading={evaluating}
                      onClick={evaluate}
                      disabled={!answer.trim()}
                    >
                      Evaluate voice answer
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {evaluation && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel icon={<Waves className="h-3.5 w-3.5" />}>Voice answer feedback</SectionLabel>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {formatNumber(evaluation.total_score)}/100
                  </span>
                  <SpeakButton text={evaluation.feedback} label="Read feedback" />
                </div>
              </div>
              <ProgressBar value={evaluation.total_score} />
              <EvaluationPanel evaluation={evaluation} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  Transcript submitted as voice input · {question?.category ?? "practice"} · evaluated with the same
                  weights as text.
                </span>
                <Link to="/analytics" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  View performance trend
                </Link>
              </div>
            </div>
          )}

          {!question && (
            <Card className="p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Tips for a realistic voice viva
              </p>
              <ul className="mt-2 grid gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                <li>Use headphones to avoid echo and accidental re-recognition.</li>
                <li>Speak one idea per sentence; the transcript is easier to correct.</li>
                <li>Do not read a written script — examiners notice unnatural delivery.</li>
                <li>Practice the same question twice and compare the two scores.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className={cn("inline-flex items-center gap-1.5", serverSttAvailable && "text-emerald-600 dark:text-emerald-400")}>
          <Sparkles className="h-3.5 w-3.5" />
          {serverSttAvailable
            ? "Server transcription is available alongside browser dictation."
            : "Browser dictation is the active speech-to-text path on this deployment."}
        </span>
        <span>No audio is stored by the platform; only the transcript you submit is evaluated.</span>
      </div>
    </div>
  );
}

function MicrophoneIcon() {
  return <Mic className="h-4 w-4" />;
}

export default VoicePractice;
