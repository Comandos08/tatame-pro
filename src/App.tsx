import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

// Public pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

// Identity
import IdentityWizard from "@/pages/IdentityWizard";

// Portal
import PortalRouter from "@/pages/PortalRouter";

// Admin
import AdminDashboard from "@/pages/AdminDashboard";
import AdminDiagnostics from "@/pages/AdminDiagnostics";
import TenantControl from "@/pages/TenantControl";

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
        <Route path="/help" element={<Help />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Identity */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />

        {/* Portal */}
        <Route path="/portal/*" element={<PortalRouter />} />

        {/* Admin (Superadmin only - protected by IdentityGate R5) */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/diagnostics" element={<AdminDiagnostics />} />
        <Route path="/admin/tenants/:tenantId/control" element={<TenantControl />} />

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
