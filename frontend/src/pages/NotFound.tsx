import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "../components/UI";

export function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <span className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        <Compass className="h-8 w-8" />
      </span>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">404</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        This page wandered off
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        The page you are looking for does not exist or was moved. Head back to your dashboard.
      </p>
      <Link to="/dashboard" className="mt-5">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
