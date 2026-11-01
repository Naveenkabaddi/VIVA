import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Cpu,
  Database,
  KeyRound,
  Mic,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
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
} from "../components/UI";
import { SectionLabel } from "../components/Widgets";
import { useAuth } from "../context/AuthContext";
import { useTheme, type Theme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { api, apiErrorMessage, setToken } from "../lib/api";
import { useApiResource } from "../lib/hooks";
import type { AIStatus, User } from "../lib/types";
import { DIFFICULTY_OPTIONS, cn, formatNumber } from "../lib/utils";

const THEME_OPTIONS: Array<{ value: Theme; label: string; description: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", description: "Bright surfaces for daytime study.", icon: Sun },
  { value: "dark", label: "Dark", description: "Reduced glare for long sessions.", icon: Moon },
  { value: "system", label: "System", description: "Follow your operating system.", icon: Monitor },
];

export function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const ai = useApiResource<AIStatus>(
    () => api.get<AIStatus>("/ai/status").then((response) => response.data),
    [],
  );

  const [defaultDifficulty, setDefaultDifficulty] = useState<string>(user?.default_difficulty ?? "mixed");
  const [ttsEnabled, setTtsEnabled] = useState(user?.tts_enabled ?? true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!user) return;
    setDefaultDifficulty(user.default_difficulty);
    setTtsEnabled(user.tts_enabled);
  }, [user]);

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      const { data } = await api.patch<User>("/auth/me", {
        default_difficulty: defaultDifficulty,
        tts_enabled: ttsEnabled,
      });
      updateUser(data);
      toast("Preferences saved.", "success");
    } catch (err) {
      toast(apiErrorMessage(err), "error");
    } finally {
      setSavingPrefs(false);
    }
  };

  const changePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError("New password must contain at least one letter and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password changed successfully.", "success");
    } catch (err) {
      setPasswordError(apiErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError("");
    if (deleteConfirm !== "DELETE") {
      setDeleteError('Type DELETE in capitals to confirm.');
      return;
    }
    if (!deletePassword) {
      setDeleteError("Enter your current password.");
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/auth/me", { data: { password: deletePassword } });
      setToken(null);
      logout();
      toast("Your account and all data have been deleted.", "success");
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Control appearance, examiner defaults, security and your stored data."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Appearance"
              description="Theme is saved locally and synced to your account."
              action={<Palette className="h-4 w-4 text-slate-400" />}
            />
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTheme(option.value);
                      toast(`Theme set to ${option.label.toLowerCase()}.`, "success");
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition",
                      active
                        ? "border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20 dark:border-brand-400 dark:bg-brand-500/10"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
                    )}
                    aria-pressed={active}
                  >
                    <span className="flex items-center justify-between">
                      <option.icon className={active ? "h-5 w-5 text-brand-600 dark:text-brand-400" : "h-5 w-5 text-slate-400"} />
                      {active && <Check className="h-4 w-4 text-brand-600 dark:text-brand-400" />}
                    </span>
                    <span className="mt-3 block text-sm font-bold text-slate-900 dark:text-white">{option.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Examiner defaults"
              description="Pre-fill new mock vivas and voice practice with your preferred settings."
              action={<Sparkles className="h-4 w-4 text-slate-400" />}
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Default difficulty" htmlFor="settings-difficulty">
                <Select
                  id="settings-difficulty"
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
                  <span className="inline-flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4" /> {ttsEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <span
                    className={
                      ttsEnabled
                        ? "flex h-5 w-9 items-center rounded-full bg-brand-600 p-0.5"
                        : "flex h-5 w-9 items-center rounded-full bg-slate-300 p-0.5 dark:bg-slate-600"
                    }
                  >
                    <span
                      className={
                        ttsEnabled ? "ml-auto h-4 w-4 rounded-full bg-white shadow" : "h-4 w-4 rounded-full bg-white shadow"
                      }
                    />
                  </span>
                </button>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  A hint for voice practice; you can always use read-aloud manually.
                </p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <Button onClick={savePreferences} loading={savingPrefs}>
                Save preferences
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Change password"
              description="Use at least 8 characters with a letter and a number."
              action={<KeyRound className="h-4 w-4 text-slate-400" />}
            />
            <div className="space-y-4 p-5">
              {passwordError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {passwordError}
                </div>
              )}
              <Field label="Current password" htmlFor="current-password">
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Current password"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New password" htmlFor="new-password">
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="New password"
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="confirm-password">
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                  />
                </Field>
              </div>
              <Button
                variant="secondary"
                icon={<ShieldCheck className="h-4 w-4" />}
                loading={changingPassword}
                onClick={changePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update password
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="AI engine status"
              description="What is powering questions, evaluation and reports right now."
              action={
                <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={ai.reload}>
                  Refresh
                </Button>
              }
            />
            {ai.loading && !ai.data ? (
              <Spinner label="Checking the AI stack…" />
            ) : ai.error && !ai.data ? (
              <div className="p-5">
                <ErrorBanner message={ai.error} onRetry={ai.reload} />
              </div>
            ) : ai.data ? (
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ai.data.mode === "gemini" ? "violet" : "emerald"}>
                    {ai.data.mode === "gemini" ? "Gemini" : "Offline engine"}
                  </Badge>
                  <Badge tone="slate">Embeddings: {ai.data.embeddings}</Badge>
                </div>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{ai.data.note}</p>
                <Divider />
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Cpu className="h-3.5 w-3.5" /> Language model
                    </span>
                    <Badge tone={ai.data.llm.enabled ? "emerald" : "slate"}>
                      {ai.data.llm.enabled ? ai.data.llm.model ?? "configured" : "disabled"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Mic className="h-3.5 w-3.5" /> Speech to text
                    </span>
                    <Badge tone="slate">{ai.data.voice.speech_to_text.provider}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Volume2 className="h-3.5 w-3.5" /> Text to speech
                    </span>
                    <Badge tone="slate">{ai.data.voice.text_to_speech.provider}</Badge>
                  </div>
                </div>
                <Divider />
                <div>
                  <SectionLabel icon={<Database className="h-3.5 w-3.5" />}>Scoring weights</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {Object.entries(ai.data.scoring_weights).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-950/40">
                        <span className="capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-bold">{formatNumber(value * 100, 0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Privacy & data" description="How your report and answers are handled." />
            <div className="space-y-3 p-5 pt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                Documents are chunked and indexed under your account only. Retrieval is filtered by owner and project.
              </p>
              <p className="flex gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                Evaluations, answers and reports are stored so analytics and recommendations remain reproducible.
              </p>
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                Uploaded text is treated as untrusted data. Prompts instruct the model to ignore embedded instructions.
              </p>
            </div>
          </Card>

          <Card className="border-rose-200 dark:border-rose-500/30">
            <CardHeader
              title="Danger zone"
              description="Permanently delete your account, projects, documents and all evaluations."
              action={<AlertTriangle className="h-4 w-4 text-rose-500" />}
            />
            <div className="space-y-4 p-5">
              {deleteError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {deleteError}
                </div>
              )}
              <Field label="Current password" htmlFor="delete-password">
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Confirm with your password"
                />
              </Field>
              <Field
                label="Type DELETE to confirm"
                htmlFor="delete-confirm"
                hint="This action cannot be undone and signs you out immediately."
              >
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE"
                />
              </Field>
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                loading={deleting}
                onClick={deleteAccount}
                disabled={deleteConfirm !== "DELETE" || !deletePassword}
              >
                Delete account permanently
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          JWT authentication · per-user access controls · rate-limited API
        </span>
        <span>Signed in as {user?.email}</span>
      </div>
    </div>
  );
}

export default Settings;
