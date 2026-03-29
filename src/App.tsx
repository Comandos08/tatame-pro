import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RequireGlobalRoles } from "@/components/auth/RequireGlobalRoles";
import { RequireRoles } from "@/components/auth/RequireRoles";
import CookieConsent from "@/components/CookieConsent";

// Lazy-loaded: Public pages
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const SignUp = lazy(() => import("@/pages/SignUp"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const JoinTenant = lazy(() => import("@/pages/JoinTenant"));
const Help = lazy(() => import("@/pages/Help"));
const About = lazy(() => import("@/pages/About"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const PublicVerifyDocument = lazy(() => import("@/pages/PublicVerifyDocument"));

// Lazy-loaded: Identity
const IdentityWizard = lazy(() => import("@/pages/IdentityWizard"));

// Lazy-loaded: Admin
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminDiagnostics = lazy(() => import("@/pages/AdminDiagnostics"));
const AdminLandingSettings = lazy(() => import("@/pages/AdminLandingSettings"));
const TenantControl = lazy(() => import("@/pages/TenantControl"));
const SystemHealth = lazy(() => import("@/pages/admin/SystemHealth"));
const AuditLog = lazy(() => import("@/pages/admin/AuditLog"));
const SecurityDashboard = lazy(() => import("@/pages/admin/SecurityDashboard"));
const AdminMembershipAnalytics = lazy(() => import("@/pages/admin/AdminMembershipAnalytics"));
const MembershipObservability = lazy(() => import("@/pages/admin/MembershipObservability"));

// Lazy-loaded: Tenant layout & routers
const TenantLayout = lazy(() => import("@/layouts/TenantLayout").then(m => ({ default: m.TenantLayout })));
const TenantLanding = lazy(() => import("@/pages/TenantLanding"));
const AthleteLogin = lazy(() => import("@/pages/AthleteLogin"));
const MembershipRouter = lazy(() => import("@/routes/MembershipRouter"));
const VerifyRouter = lazy(() => import("@/routes/VerifyRouter"));
const AppRouter = lazy(() => import("@/routes/AppRouter"));

// Lazy-loaded: Athlete Portal
const AthletePortal = lazy(() => import("@/pages/AthletePortal"));
const PortalCard = lazy(() => import("@/pages/PortalCard"));
const PortalEvents = lazy(() => import("@/pages/PortalEvents"));

// Lazy-loaded: Public Tenant Pages
const PublicAcademies = lazy(() => import("@/pages/PublicAcademies"));
const PublicRankings = lazy(() => import("@/pages/PublicRankings"));
const PublicEventsList = lazy(() => import("@/pages/PublicEventsList"));
const PublicEventDetails = lazy(() => import("@/pages/PublicEventDetails"));
const PublicEventBrackets = lazy(() => import("@/pages/PublicEventBrackets"));

/**
 * Full-screen loading fallback used by Suspense boundaries.
 */
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground">Carregando a aplicação...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <IdentityGate>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/join" element={<Navigate to="/join/org" replace />} />
          <Route path="/join/org" element={<JoinTenant />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/help" element={<Help />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/verify/:token" element={<PublicVerifyDocument />} />

          {/* Identity */}
          <Route
            path="/identity/wizard"
            element={
              <ErrorBoundary componentName="IdentityWizard">
                <IdentityWizard />
              </ErrorBoundary>
            }
          />

          {/* Admin — wrapped in its own ErrorBoundary */}
          <Route
            path="/admin"
            element={
              <ErrorBoundary componentName="AdminDashboard">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <AdminDashboard />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/health"
            element={
              <ErrorBoundary componentName="SystemHealth">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <SystemHealth />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ErrorBoundary componentName="AuditLog">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <AuditLog />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/security"
            element={
              <ErrorBoundary componentName="SecurityDashboard">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <SecurityDashboard />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/diagnostics"
            element={
              <ErrorBoundary componentName="AdminDiagnostics">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <AdminDiagnostics />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/landing"
            element={
              <ErrorBoundary componentName="AdminLandingSettings">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <AdminLandingSettings />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/tenants/:tenantId/control"
            element={
              <ErrorBoundary componentName="TenantControl">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <TenantControl />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/analytics/membership"
            element={
              <ErrorBoundary componentName="AdminMembershipAnalytics">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <AdminMembershipAnalytics />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/observability/membership"
            element={
              <ErrorBoundary componentName="MembershipObservability">
                <RequireGlobalRoles allowed={["SUPERADMIN_GLOBAL"]}>
                  <MembershipObservability />
                </RequireGlobalRoles>
              </ErrorBoundary>
            }
          />

          {/* Tenant */}
          <Route path="/:tenantSlug" element={<TenantLayout />}>
            <Route index element={<TenantLanding />} />
            <Route path="login" element={<AthleteLogin />} />
            <Route path="membership/*" element={<MembershipRouter />} />
            <Route path="verify/*" element={<VerifyRouter />} />
            <Route path="app/*" element={<AppRouter />} />
            <Route
              path="portal"
              element={
                <RequireRoles allowed={["ATLETA"]}>
                  <AthletePortal />
                </RequireRoles>
              }
            />
            <Route
              path="portal/card"
              element={
                <RequireRoles allowed={["ATLETA"]}>
                  <PortalCard />
                </RequireRoles>
              }
            />
            <Route
              path="portal/events"
              element={
                <RequireRoles allowed={["ATLETA"]}>
                  <PortalEvents />
                </RequireRoles>
              }
            />
            <Route path="academies" element={<PublicAcademies />} />
            <Route path="rankings" element={<PublicRankings />} />
            <Route path="events" element={<PublicEventsList />} />
            <Route path="events/:eventId" element={<PublicEventDetails />} />
            <Route path="events/:eventId/brackets" element={<PublicEventBrackets />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CookieConsent />
    </IdentityGate>
  );
}
