import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  FileStack,
  GraduationCap,
  History,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Mic,
  Moon,
  Settings,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import type { AIStatus } from "../lib/types";
import { Badge } from "./UI";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/projects", label: "Projects", icon: FileStack },
      { to: "/documents", label: "Documents", icon: BookOpenCheck },
    ],
  },
  {
    label: "Practice",
    items: [
      { to: "/viva/new", label: "Mock Viva", icon: GraduationCap },
      { to: "/practice", label: "Question Practice", icon: BrainCircuit },
      { to: "/voice", label: "Voice Practice", icon: Mic },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/recommendations", label: "Recommendations", icon: Lightbulb },
      { to: "/history", label: "Session History", icon: History },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/profile", label: "Profile", icon: UserRound },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const TITLES: Array<{ match: RegExp; title: string; subtitle: string }> = [
  { match: /^\/dashboard/, title: "Dashboard", subtitle: "Your preparation at a glance" },
  { match: /^\/projects$/, title: "Projects", subtitle: "Reports and project knowledge bases" },
  { match: /^\/projects\/\d+/, title: "Project workspace", subtitle: "Documents, analysis and readiness" },
  { match: /^\/documents/, title: "Documents", subtitle: "Uploaded reports and processing status" },
  { match: /^\/viva\/new/, title: "Start a mock viva", subtitle: "Configure your examiner session" },
  { match: /^\/viva\/\d+\/report/, title: "Viva report", subtitle: "Evidence-based examiner feedback" },
  { match: /^\/viva\/\d+/, title: "Mock viva", subtitle: "Live adaptive examination" },
  { match: /^\/practice/, title: "Question practice", subtitle: "Generate and evaluate answers at your pace" },
  { match: /^\/voice/, title: "Voice practice", subtitle: "Speak answers like a real viva" },
  { match: /^\/analytics/, title: "Analytics", subtitle: "Performance trends and weak areas" },
  { match: /^\/recommendations/, title: "Recommendations", subtitle: "Personalised preparation plan" },
  { match: /^\/history/, title: "Session history", subtitle: "Every viva you have attempted" },
  { match: /^\/profile/, title: "Profile", subtitle: "Your account and activity" },
  { match: /^\/settings/, title: "Settings", subtitle: "Preferences, security and data" },
];

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/30">
        <GraduationCap className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
          VivaForge
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-500">
          AI viva prep
        </span>
      </span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-3">
        <Brand />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <Link
          to="/profile"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-bold text-white dark:from-brand-500 dark:to-violet-600">
            {user?.name?.slice(0, 1).toUpperCase() ?? "V"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
              {user?.name ?? "Student"}
            </span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, resolved, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const meta = TITLES.find((item) => item.match.test(location.pathname)) ?? {
    title: "VivaForge",
    subtitle: "AI viva preparation",
  };

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .get<AIStatus>("/ai/status")
      .then((response) => setAiStatus(response.data))
      .catch(() => setAiStatus(null));
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggleTheme = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">{meta.title}</h2>
                <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                  {meta.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {aiStatus && (
                <Badge tone={aiStatus.mode === "gemini" ? "violet" : "emerald"} className="hidden sm:inline-flex">
                  {aiStatus.mode === "gemini" ? "Gemini AI" : "Offline engine"}
                </Badge>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                title={`Theme: ${theme}`}
              >
                {resolved === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-lg p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Account menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-bold text-white">
                    {user?.name?.slice(0, 1).toUpperCase() ?? "V"}
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-12 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <div className="px-2.5 py-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                    </div>
                    <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
                    <button
                      type="button"
                      onClick={() => navigate("/profile")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <UserRound className="h-4 w-4" /> Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/settings")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        navigate("/login");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
