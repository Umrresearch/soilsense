import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner, ErrorBoundary } from './components/ui.jsx';
import AppShell from './components/AppShell.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from './pages/AccountFlows.jsx';
import NotFound from './pages/NotFound.jsx';

// chart-heavy pages are code-split so the landing/login pages stay light on slow rural networks
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Recommendations = lazy(() => import('./pages/Recommendations.jsx'));
const AnalyticsSensors = lazy(() => import('./pages/AnalyticsSensors.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function RequireAuth({ children }) {
  const { farmer, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner large label="Checking your session…" />;
  if (!farmer) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

// old /app/sensors links → combined page, keeping ?field=
function SensorsRedirect() {
  const loc = useLocation();
  return <Navigate to={`/app/analytics${loc.search}`} replace />;
}

function PublicOnly({ children }) {
  const { farmer } = useAuth();
  return farmer ? <Navigate to="/app" replace /> : children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner large />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="sensors" element={<SensorsRedirect />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="analytics" element={<AnalyticsSensors />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
