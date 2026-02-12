import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

// Public pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import Help from "@/pages/Help";
import About from "@/pages/About";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";
import PublicVerifyDocument from "@/pages/PublicVerifyDocument";

// Identity
import IdentityWizard from "@/pages/IdentityWizard";

// Portal
import PortalRouter from "@/pages/PortalRouter";

// Admin
import AdminDashboard from "@/pages/AdminDashboard";
import AdminDiagnostics from "@/pages/AdminDiagnostics";
import AdminLandingSettings from "@/pages/AdminLandingSettings";
import TenantControl from "@/pages/TenantControl";
import SystemHealth from "@/pages/admin/SystemHealth";
import AuditLog from "@/pages/admin/AuditLog";
import SecurityDashboard from "@/pages/admin/SecurityDashboard";
import AdminMembershipAnalytics from "@/pages/admin/AdminMembershipAnalytics";
import { RequireGlobalRoles } from "@/components/auth/RequireGlobalRoles";


// Tenant
import { TenantLayout } from "@/layouts/TenantLayout";
import TenantLanding from "@/pages/TenantLanding";
import AthleteLogin from "@/pages/AthleteLogin";

// Tenant Domain Routers
import MembershipRouter from "@/routes/MembershipRouter";
import VerifyRouter from "@/routes/VerifyRouter";
import AppRouter from "@/routes/AppRouter";

// Athlete Portal
import AthletePortal from "@/pages/AthletePortal";
import PortalCard from "@/pages/PortalCard";
import PortalEvents from "@/pages/PortalEvents";

// Public Tenant Pages
import PublicAcademies from "@/pages/PublicAcademies";
import PublicRankings from "@/pages/PublicRankings";
import PublicEventsList from "@/pages/PublicEventsList";
import PublicEventDetails from "@/pages/PublicEventDetails";

export default function App() {
  return (
    <IdentityGate>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/help" element={<Help />} />
        <Route path="/about" element={<About />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        {/* Public Document Verification (PI-D3-DOCS1.0) */}
        <Route path="/verify/:token" element={<PublicVerifyDocument />} />

        {/* Identity */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />

        {/* Portal */}
        <Route path="/portal/*" element={<PortalRouter />} />

        {/* Admin (Superadmin only - explicit RequireRoles guard) */}
        <Route path="/admin" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><AdminDashboard /></RequireGlobalRoles>} />
        <Route path="/admin/health" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><SystemHealth /></RequireGlobalRoles>} />
        <Route path="/admin/audit" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><AuditLog /></RequireGlobalRoles>} />
        <Route path="/admin/security" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><SecurityDashboard /></RequireGlobalRoles>} />
        <Route path="/admin/diagnostics" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><AdminDiagnostics /></RequireGlobalRoles>} />
        <Route path="/admin/landing" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><AdminLandingSettings /></RequireGlobalRoles>} />
        <Route path="/admin/tenants/:tenantId/control" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><TenantControl /></RequireGlobalRoles>} />
        <Route path="/admin/analytics/membership" element={<RequireGlobalRoles allowed={['SUPERADMIN_GLOBAL']}><AdminMembershipAnalytics /></RequireGlobalRoles>} />


        {/* Tenant routes */}
        <Route path="/:tenantSlug" element={<TenantLayout />}>
          <Route index element={<TenantLanding />} />
          <Route path="login" element={<AthleteLogin />} />
          
          {/* Domain Routers (modular) */}
          <Route path="membership/*" element={<MembershipRouter />} />
          <Route path="verify/*" element={<VerifyRouter />} />
          <Route path="app/*" element={<AppRouter />} />
          
          {/* Athlete Portal */}
          <Route path="portal" element={<AthletePortal />} />
          <Route path="portal/card" element={<PortalCard />} />
          <Route path="portal/events" element={<PortalEvents />} />
          
          {/* Public Tenant Pages */}
          <Route path="academies" element={<PublicAcademies />} />
          <Route path="rankings" element={<PublicRankings />} />
          <Route path="events" element={<PublicEventsList />} />
          <Route path="events/:eventId" element={<PublicEventDetails />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
