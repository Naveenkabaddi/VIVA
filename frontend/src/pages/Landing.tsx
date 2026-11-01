import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  GraduationCap,
  Lightbulb,
  Mic,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge, Button, Card } from "../components/UI";

const FEATURES = [
  {
    icon: FileSearch,
    title: "Report-grounded questions",
    text: "Upload a PDF, DOCX or TXT report. The RAG engine chunks, indexes and asks about your actual architecture, algorithms and results.",
  },
  {
    icon: BrainCircuit,
    title: "Adaptive mock vivas",
    text: "Follow-up questions respond to your answer quality and missing concepts, just like a real examiner probing deeper.",
  },
  {
    icon: Target,
    title: "Criterion-level evaluation",
    text: "Accuracy, relevance, completeness, understanding and clarity are scored independently and combined with fixed weights.",
  },
  {
    icon: BarChart3,
    title: "Analytics that mean something",
    text: "Trends, difficulty breakdowns, recurring missing concepts and strong/weak categories computed only from stored evaluations.",
  },
  {
    icon: Lightbulb,
    title: "Personalised preparation plan",
    text: "Recommendations are derived from your weakest criteria and missing concepts, with targeted practice questions.",
  },
  {
    icon: Mic,
    title: "Voice-first practice",
    text: "Dictate answers in the browser or transcribe audio server-side. Every transcript goes through the same evaluation pipeline.",
  },
];

const STEPS = [
  { icon: BookOpenCheck, title: "Add your project", text: "Describe the project and upload your final report." },
  { icon: FileSearch, title: "Build the knowledge base", text: "Text is extracted, section-aware chunks are embedded and indexed." },
  { icon: GraduationCap, title: "Face the examiner", text: "Answer adaptive questions by text or voice in a timed session." },
  { icon: BarChart3, title: "Review and improve", text: "Get an evidence-based report, analytics and a focused plan." },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/30">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-tight">VivaForge</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-500">
                AI viva prep
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" icon={<ArrowRight className="h-4 w-4" />}>
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.16),transparent)]" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
            <div className="animate-fade-up">
              <Badge tone="brand" className="mb-4">
                <Sparkles className="h-3 w-3" /> Grounded in your own report
              </Badge>
              <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Walk into your viva{" "}
                <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                  already prepared.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
                VivaForge turns your project report into an adaptive mock examiner. Practise
                report-specific questions, get criterion-level scoring with evidence, and follow a
                preparation plan built from your weakest concepts.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                    Start preparing free
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" size="lg">
                    I already have an account
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Works offline without an API key
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Your documents stay private
                </span>
              </div>
            </div>

            <div className="relative animate-fade-up lg:pl-6" style={{ animationDelay: "80ms" }}>
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-500/20 via-violet-500/10 to-fuchsia-500/20 blur-2xl" />
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Mock viva · in progress
                  </div>
                  <Badge tone="violet">Question 4 / 8</Badge>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-500">
                      Database Design
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                      Your report normalises the schema to third normal form. Walk me through the
                      tables and explain how the foreign keys enforce consistency.
                    </p>
                  </div>
                  <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Evaluation</span>
                      <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">84</span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {[92, 88, 78, 85, 80].map((value, index) => (
                        <div key={index} className="text-center">
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
                              style={{ width: `${value}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Strong answer. Add one quantified example to defend the normalisation trade-off.
                  </div>
                </div>
              </Card>
              <div className="mt-3 flex justify-end">
                <Badge tone="emerald">
                  <Sparkles className="h-3 w-3" /> Evidence grounded in page 7
                </Badge>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-500">Everything in one loop</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                From report upload to examiner-ready answers
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Each module feeds the next. Questions are generated from your report, evaluations
                are stored, and analytics and recommendations are computed from that real evidence.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Card key={step.title} className="relative p-5">
                  <span className="absolute right-4 top-4 text-3xl font-black text-slate-100 dark:text-slate-800">
                    0{index + 1}
                  </span>
                  <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{step.text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
              Prepare for the questions that actually matter
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500 dark:text-slate-400">
              No generic question banks. No fabricated evidence. Just your project, examined properly.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="inline-flex rounded-xl bg-gradient-to-br from-brand-500/10 to-violet-500/10 p-2.5 text-brand-600 dark:text-brand-400">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{feature.text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 px-6 py-12 text-center text-white shadow-2xl shadow-brand-600/25 sm:px-12">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Your examiner is waiting.</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/80">
              Create an account, upload your report, and take your first adaptive mock viva in minutes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-white text-brand-700 hover:bg-slate-100">
                  Create free account
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/70">
              <span>Accuracy 30%</span>
              <span>Relevance 20%</span>
              <span>Completeness 20%</span>
              <span>Understanding 20%</span>
              <span>Clarity 10%</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} VivaForge · AI Viva Preparation Platform</p>
          <p>Built for evidence-based viva preparation.</p>
        </div>
      </footer>
    </div>
  );
}
