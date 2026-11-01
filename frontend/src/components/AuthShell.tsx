import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, GraduationCap, Sparkles } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-700 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_35%),radial-gradient(circle_at_80%_70%,white,transparent_30%)]" />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">VivaForge</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                AI viva preparation
              </span>
            </span>
          </Link>
        </div>
        <div className="relative max-w-md">
          <Sparkles className="mb-5 h-8 w-8 text-white/70" />
          <h2 className="text-3xl font-black leading-tight tracking-tight">
            The examiner will ask about your project. Be ready for every follow-up.
          </h2>
          <ul className="mt-7 space-y-3 text-sm text-white/85">
            {[
              "Questions grounded in your uploaded report",
              "Adaptive follow-ups based on what you missed",
              "Criterion-level scoring with transparent evidence",
              "Analytics, weak topics and a personal plan",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/55">
          Works fully offline with the deterministic examiner engine, or with Gemini when an API key is configured.
        </p>
      </div>

      <div className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-600 dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <div className="mb-7 lg:hidden">
            <span className="inline-flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">VivaForge</span>
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">{footer}</div>
        </div>
      </div>
    </div>
  );
}
