import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  Check,
  GraduationCap,
  Lightbulb,
  LogOut,
  Mail,
  Moon,
  Save,
  Settings,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from "../components/UI";
import { SectionLabel, TickList } from "../components/Widgets";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { User } from "../lib/types";
import { DIFFICULTY_OPTIONS, formatDate } from "../lib/utils";

export function Profile() {
  const { user, updateUser, logout, refresh } = useAuth();
  const { theme, resolved } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useApiResource<User>(
    () => api.get<User>("/auth/me").then((response) => response.data),
    [],
  );

  const profile = data ?? user;

  const [name, setName] = useState(profile?.name ?? "");
  const [defaultDifficulty, setDefaultDifficulty] = useState<string>(profile?.default_difficulty ?? "mixed");
  const [ttsEnabled, setTtsEnabled] = useState(profile?.tts_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setDefaultDifficulty(profile.default_difficulty);
    setTtsEnabled(profile.tts_enabled);
  }, [profile]);

  const save = async () => {
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const { data: updated } = await api.patch<User>("/auth/me", {
        name: name.trim(),
        default_difficulty: defaultDifficulty,
        tts_enabled: ttsEnabled,
      });
      updateUser(updated);
      toast("Profile updated.", "success");
      reload();
      void refresh();
    } catch (err) {
      const message = apiErrorMessage(err);
      setFormError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!profile) {
    return loading ? <Spinner label="Loading your profile…" /> : <ErrorBanner message="Could not load your profile." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Manage your identity, examiner defaults and how the platform talks to you."
        actions={
          <>
            <Link to="/settings">
              <Button variant="secondary" icon={<Settings className="h-4 w-4" />}>
                Settings &amp; security
              </Button>
            </Link>
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={signOut}>
              Sign out
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-brand-50 via-white to-violet-50 p-6 dark:from-brand-500/10 dark:via-slate-900 dark:to-violet-500/10 sm:flex-row sm:items-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-3xl font-black text-white shadow-lg shadow-brand-500/25">
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{profile.name}</h2>
              <Badge tone="brand">
                <BadgeCheck className="h-3 w-3" /> {profile.role}
              </Badge>
              <Badge tone="slate">{profile.default_difficulty} default</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <Mail className="h-3.5 w-3.5" /> {profile.email}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              <CalendarDays className="h-3 w-3" /> Member since {formatDate(profile.created_at)}
              <span>·</span>
              <Moon className="h-3 w-3" /> Theme: {resolved} ({theme})
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Projects"
          value={profile.project_count ?? 0}
          hint="Private knowledge bases"
          icon={<BookOpenCheck className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Sessions attempted"
          value={profile.session_count ?? 0}
          hint="Mock vivas started"
          icon={<GraduationCap className="h-5 w-5" />}
          tone="violet"
        />
        <StatCard
          label="Completed"
          value={profile.completed_sessions ?? 0}
          hint="Sessions with a report"
          icon={<Target className="h-5 w-5" />}
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Profile details"
            description="Your name and examiner defaults are used across mock vivas and practice."
          />
          <div className="space-y-4 p-5">
            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {formError}
              </div>
            )}
            <Field label="Display name" htmlFor="profile-name" hint="Shown in the sidebar and examiner reports.">
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="Your name"
              />
            </Field>
            <Field label="Email" htmlFor="profile-email" hint="Email changes are not enabled in this release.">
              <Input id="profile-email" value={profile.email} readOnly disabled />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default difficulty" htmlFor="profile-difficulty" hint="Pre-selected when you start a viva.">
                <Select
                  id="profile-difficulty"
                  value={defaultDifficulty}
                  onChange={(event) => setDefaultDifficulty(event.target.value)}
                >
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Read-aloud preference
                </span>
                <button
                  type="button"
                  onClick={() => setTtsEnabled((value) => !value)}
                  className={
                    ttsEnabled
                      ? "flex h-10 w-full items-center justify-between rounded-lg border border-brand-500 bg-brand-50 px-3 text-sm font-semibold text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300"
                      : "flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }
                  aria-pressed={ttsEnabled}
                >
                  <span>{ttsEnabled ? "Read aloud enabled" : "Read aloud disabled"}</span>
                  <span
                    className={
                      ttsEnabled
                        ? "flex h-5 w-9 items-center rounded-full bg-brand-600 p-0.5"
                        : "flex h-5 w-9 items-center rounded-full bg-slate-300 p-0.5 dark:bg-slate-600"
                    }
                  >
                    <span
                      className={
                        ttsEnabled
                          ? "ml-auto h-4 w-4 rounded-full bg-white shadow"
                          : "h-4 w-4 rounded-full bg-white shadow"
                      }
                    />
                  </span>
                </button>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Controls the suggested voice preference on supported browsers.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save}>
                Save changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setName(profile.name);
                  setDefaultDifficulty(profile.default_difficulty);
                  setTtsEnabled(profile.tts_enabled);
                  setFormError("");
                }}
                disabled={saving}
              >
                Reset
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionLabel icon={<Sparkles className="h-3.5 w-3.5" />}>Account snapshot</SectionLabel>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Role</span>
                <Badge tone="brand">{profile.role}</Badge>
              </div>
              <Divider />
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Theme</span>
                <Badge tone="slate">{theme}</Badge>
              </div>
              <Divider />
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Default difficulty</span>
                <Badge tone="violet">{profile.default_difficulty}</Badge>
              </div>
              <Divider />
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Read aloud</span>
                <Badge tone={profile.tts_enabled ? "emerald" : "slate"}>
                  {profile.tts_enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Keep improving" description="Your next useful actions." />
            <div className="space-y-2 p-5 pt-3">
              {[
                {
                  to: "/viva/new",
                  icon: GraduationCap,
                  title: "Take a mock viva",
                  text: "Turn stored feedback into a higher score.",
                },
                {
                  to: "/recommendations",
                  icon: Lightbulb,
                  title: "Open your plan",
                  text: "Work through high-priority gaps.",
                },
                {
                  to: "/analytics",
                  icon: Target,
                  title: "Review analytics",
                  text: "Check whether the trend is rising.",
                },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
                >
                  <span className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">{item.title}</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{item.text}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <SectionLabel icon={<UserRound className="h-3.5 w-3.5" />}>Data ownership</SectionLabel>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TickList
            items={[
              "Projects, documents and evaluations are scoped to your account only.",
              "Deleting a project removes its documents, sessions and evaluations.",
              "You can delete your entire account and all data from Settings.",
            ]}
            tone="emerald"
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
            <p className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
              <Check className="h-3.5 w-3.5 text-emerald-500" /> Privacy by design
            </p>
            <p className="mt-2">
              Uploaded reports are processed only to generate grounded questions and evaluations. Voice audio is not
              stored; only the transcript you submit becomes part of your answer record.
            </p>
            <Link
              to="/settings"
              className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              Manage data <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default Profile;
