import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { Analytics } from "./pages/Analytics";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { History } from "./pages/History";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { Practice } from "./pages/Practice";
import { Profile } from "./pages/Profile";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { Recommendations } from "./pages/Recommendations";
import { Register } from "./pages/Register";
import { Settings } from "./pages/Settings";
import { VivaReport } from "./pages/VivaReport";
import { VivaSession } from "./pages/VivaSession";
import { VivaSetup } from "./pages/VivaSetup";
import { VoicePractice } from "./pages/Voice";

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Landing />} />

              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/viva/new" element={<VivaSetup />} />
                  <Route path="/viva/:id" element={<VivaSession />} />
                  <Route path="/viva/:id/report" element={<VivaReport />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/recommendations" element={<Recommendations />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/practice" element={<Practice />} />
                  <Route path="/voice" element={<VoicePractice />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
