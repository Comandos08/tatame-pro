import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AthleteRouteGuard } from '@/components/auth/AthleteRouteGuard';
import { RequireRoles } from '@/components/auth/RequireRoles';
import { useCurrentUser } from '@/contexts/AuthContext';
import { ACCESS_MATRIX } from '@/lib/accessMatrix';

// Pages
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import AdminDashboard from '@/pages/AdminDashboard';
import TenantLanding from '@/pages/TenantLanding';
import TenantDashboard from '@/pages/TenantDashboard';
import MembershipList from '@/pages/MembershipList';
import MembershipDetails from '@/pages/MembershipDetails';
import MembershipStatus from '@/pages/MembershipStatus';
import MembershipRenew from '@/pages/MembershipRenew';
import AcademiesList from '@/pages/AcademiesList';
import CoachesList from '@/pages/CoachesList';
import ApprovalsList from '@/pages/ApprovalsList';
import ApprovalDetails from '@/pages/ApprovalDetails';
import GradingSchemesList from '@/pages/GradingSchemesList';
import GradingLevelsList from '@/pages/GradingLevelsList';
import AthleteGradingsPage from '@/pages/AthleteGradingsPage';
import AthletesList from '@/pages/AthletesList';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import VerifyCard from '@/pages/VerifyCard';
import VerifyDiploma from '@/pages/VerifyDiploma';
import VerifyMembership from '@/pages/VerifyMembership';
import NotFound from '@/pages/NotFound';
import Help from '@/pages/Help';
import TenantHelp from '@/pages/TenantHelp';
import AuditLog from '@/pages/AuditLog';
import PublicAcademies from '@/pages/PublicAcademies';
import PublicRankings from '@/pages/PublicRankings';
import InternalRankings from '@/pages/InternalRankings';
import TenantSettings from '@/pages/TenantSettings';
import TenantBilling from '@/pages/TenantBilling';
import AthleteArea from '@/pages/AthleteArea';
import TenantControl from '@/pages/TenantControl';
import AthletePortal from '@/pages/AthletePortal';
import TenantOnboarding from '@/pages/TenantOnboarding';
import PortalEvents from '@/pages/PortalEvents';
import PortalCard from '@/pages/PortalCard';
import EventsList from '@/pages/EventsList';
import EventDetails from '@/pages/EventDetails';
import PublicEventsList from '@/pages/PublicEventsList';
import PublicEventDetails from '@/pages/PublicEventDetails';
import AuthCallback from '@/pages/AuthCallback';
import AthleteLogin from '@/pages/AthleteLogin';
import PortalRouter from '@/pages/PortalRouter';

// 🔐 Join Wizard (Anti-Orphan User)
import JoinOrg from '@/pages/JoinOrg';
import JoinAccount from '@/pages/JoinAccount';
import JoinConfirm from '@/pages/JoinConfirm';

// Membership components
import { MembershipTypeSelector } from '@/components/membership/MembershipTypeSelector';
import { AdultMembershipForm } from '@/components/membership/AdultMembershipForm';
import { YouthMembershipForm } from '@/components/membership/YouthMembershipForm';
import { MembershipSuccess } from '@/components/membership/MembershipSuccess';

// Layouts
import { TenantLayout } from '@/layouts/TenantLayout';

/**
 * 🔐 AdminRoute — Global Superadmin Only
 * Redirects to /portal (decision hub) on unauthorized access.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isGlobalSuperadmin, isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  if (!isGlobalSuperadmin) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/help" element={<Help />} />
      
      {/* Auth callback for Magic Link */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* 🔐 JOIN WIZARD — Mandatory onboarding for new users (Anti-Orphan) */}
      <Route path="/join" element={<Navigate to="/join/org" replace />} />
      <Route path="/join/org" element={<JoinOrg />} />
      <Route path="/join/account" element={<JoinAccount />} />
      <Route path="/join/confirm" element={<JoinConfirm />} />

      {/* 🔐 PORTAL ROUTER — Single decision point for post-login routing */}
      <Route path="/portal" element={<PortalRouter />} />

      {/* Admin routes - Global Superadmin only */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/tenants/:tenantId/control"
        element={
          <AdminRoute>
            <TenantControl />
          </AdminRoute>
        }
      />

      {/* Tenant routes */}
      <Route path="/:tenantSlug" element={<TenantLayout />}>
        {/* Public tenant landing */}
        <Route index element={<TenantLanding />} />
        
        {/* Athlete login (Magic Link) */}
        <Route path="login" element={<AthleteLogin />} />
        
        {/* Public verification routes */}
        <Route path="verify/card/:cardId" element={<VerifyCard />} />
        <Route path="verify/diploma/:diplomaId" element={<VerifyDiploma />} />
        <Route path="verify/membership/:membershipId" element={<VerifyMembership />} />
        <Route path="academies" element={<PublicAcademies />} />
        <Route path="rankings" element={<PublicRankings />} />
        <Route path="events" element={<PublicEventsList />} />
        <Route path="events/:eventId" element={<PublicEventDetails />} />
        
        {/* Public membership routes */}
        <Route path="membership/new" element={<MembershipTypeSelector />} />
        <Route path="membership/adult" element={<AdultMembershipForm />} />
        <Route path="membership/youth" element={<YouthMembershipForm />} />
        <Route path="membership/success" element={<MembershipSuccess />} />
        <Route path="membership/status" element={<AthleteRouteGuard><MembershipStatus /></AthleteRouteGuard>} />
        <Route path="membership/renew" element={<AthleteRouteGuard><MembershipRenew /></AthleteRouteGuard>} />
        
        {/* 🔐 Portal do Atleta - protected with AthleteRouteGuard + RequireRoles */}
        <Route path="portal" element={
          <AthleteRouteGuard>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL}>
              <AthletePortal />
            </RequireRoles>
          </AthleteRouteGuard>
        } />
        <Route path="portal/events" element={
          <AthleteRouteGuard>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_EVENTS}>
              <PortalEvents />
            </RequireRoles>
          </AthleteRouteGuard>
        } />
        <Route path="portal/card" element={
          <AthleteRouteGuard>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_CARD}>
              <PortalCard />
            </RequireRoles>
          </AthleteRouteGuard>
        } />
        
        {/* 🔐 Protected tenant app routes - with specific role requirements */}
        <Route path="app/onboarding" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_SETTINGS}>
            <TenantOnboarding />
          </RequireRoles>
        } />
        
        <Route path="app" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
            <TenantDashboard />
          </RequireRoles>
        } />
        
        <Route path="app/memberships" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
            <MembershipList />
          </RequireRoles>
        } />
        <Route path="app/memberships/:membershipId" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
            <MembershipDetails />
          </RequireRoles>
        } />
        
        <Route path="app/academies" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_ACADEMIES}>
            <AcademiesList />
          </RequireRoles>
        } />
        
        <Route path="app/coaches" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_COACHES}>
            <CoachesList />
          </RequireRoles>
        } />
        
        {/* 🔐 SENSITIVE: Approval flow */}
        <Route path="app/approvals" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_APPROVALS}>
            <ApprovalsList />
          </RequireRoles>
        } />
        <Route path="app/approvals/:membershipId" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_APPROVALS}>
            <ApprovalDetails />
          </RequireRoles>
        } />
        
        <Route path="app/grading-schemes" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_GRADINGS}>
            <GradingSchemesList />
          </RequireRoles>
        } />
        <Route path="app/grading-schemes/:schemeId/levels" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_GRADINGS}>
            <GradingLevelsList />
          </RequireRoles>
        } />
        
        <Route path="app/athletes" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_ATHLETES}>
            <AthletesList />
          </RequireRoles>
        } />
        <Route path="app/athletes/:athleteId/gradings" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_ATHLETES}>
            <AthleteGradingsPage />
          </RequireRoles>
        } />
        
        <Route path="app/rankings" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_RANKINGS}>
            <InternalRankings />
          </RequireRoles>
        } />
        
        <Route path="app/settings" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_SETTINGS}>
            <TenantSettings />
          </RequireRoles>
        } />
        
        {/* 🔐 SENSITIVE: Billing - admin only */}
        <Route path="app/billing" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_BILLING}>
            <TenantBilling />
          </RequireRoles>
        } />
        
        <Route path="app/me" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_MY_AREA}>
            <AthleteArea />
          </RequireRoles>
        } />
        
        <Route path="app/help" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_HELP}>
            <TenantHelp />
          </RequireRoles>
        } />
        
        <Route path="app/audit-log" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_AUDIT_LOG}>
            <AuditLog />
          </RequireRoles>
        } />
        
        <Route path="app/events" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_EVENTS}>
            <EventsList />
          </RequireRoles>
        } />
        <Route path="app/events/:eventId" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_EVENTS}>
            <EventDetails />
          </RequireRoles>
        } />
        
        {/* Catch-all for /app/* - redirect unknown routes to dashboard */}
        <Route path="app/*" element={
          <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
            <TenantDashboard />
          </RequireRoles>
        } />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
