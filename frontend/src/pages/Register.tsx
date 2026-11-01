import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button, Field, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiErrorMessage } from "../lib/api";

function passwordChecks(password: string) {
  return [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { label: "One number", ok: /\d/.test(password) },
  ];
}

export function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const strong = checks.every((check) => check.ok);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!strong) {
      setError("Please meet all password requirements.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      toast("Account created. Add your first project to begin.", "success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Turn your project report into a personal mock examiner."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}
        <Field label="Full name" htmlFor="name">
          <Input
            id="name"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Aarav Sharma"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@college.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {checks.map((check) => (
            <p
              key={check.label}
              className={
                check.ok
                  ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-[11px] text-slate-400"
              }
            >
              {check.ok ? "✓" : "•"} {check.label}
            </p>
          ))}
        </div>
        <Field label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={loading}
          icon={<UserPlus className="h-4 w-4" />}
        >
          Create account
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          By creating an account you agree to keep your uploaded material confidential and to use the
          platform for legitimate exam preparation.
        </p>
      </form>
    </AuthShell>
  );
}
