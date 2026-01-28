import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRoles } from '@/components/auth/RequireRoles';
import { ACCESS_MATRIX } from '@/lib/accessMatrix';
import { IdentityGate } from '@/components/identity/IdentityGate';
import { useCurrentUser } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/auth/AccessDenied';

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
import SecurityTimeline from '@/pages/SecurityTimeline';
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

// 🔐 Identity Wizard (Blocking Flow)
import IdentityWizard from '@/pages/IdentityWizard';
import { IdentityErrorPage } from '@/components/identity/IdentityErrorScreen';

// Membership components
import { MembershipTypeSelector } from '@/components/membership/MembershipTypeSelector';
import { AdultMembershipForm } from '@/components/membership/AdultMembershipForm';
import { YouthMembershipForm } from '@/components/membership/YouthMembershipForm';
import { MembershipSuccess } from '@/components/membership/MembershipSuccess';

// Layouts
import { TenantLayout } from '@/layouts/TenantLayout';

/**
 * 🔐 AdminRoute — Global Superadmin Only
 * Shows AccessDenied on unauthorized access (NO redirect).
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isGlobalSuperadmin, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // NO Navigate - just show AccessDenied
  if (!isGlobalSuperadmin) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* ============================================
          PUBLIC ROUTES - No guard required
          ============================================ */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/help" element={<Help />} />
      
      {/* Auth callback for Magic Link */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* ============================================
          IDENTITY WIZARD — Protected by IdentityGate
          ============================================ */}
      <Route path="/identity/wizard" element={
        <IdentityGate>
          <IdentityWizard />
        </IdentityGate>
      } />
      <Route path="/identity/error" element={<IdentityErrorPage />} />

      {/* Legacy join routes - redirect to Identity Wizard */}
      <Route path="/join" element={<Navigate to="/identity/wizard" replace />} />
      <Route path="/join/org" element={<Navigate to="/identity/wizard" replace />} />
      <Route path="/join/account" element={<Navigate to="/identity/wizard" replace />} />
      <Route path="/join/confirm" element={<Navigate to="/identity/wizard" replace />} />

      {/* ============================================
          PORTAL ROUTER — Decision hub (protected)
          ============================================ */}
      <Route path="/portal" element={
        <IdentityGate>
          <PortalRouter />
        </IdentityGate>
      } />

      {/* ============================================
          ADMIN ROUTES - Global Superadmin only
          ============================================ */}
      <Route path="/admin" element={
        <IdentityGate>
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        </IdentityGate>
      } />
      <Route path="/admin/tenants/:tenantId/control" element={
        <IdentityGate>
          <AdminRoute>
            <TenantControl />
          </AdminRoute>
        </IdentityGate>
      } />

      {/* ============================================
          TENANT ROUTES
          ============================================ */}
      <Route path="/:tenantSlug" element={<TenantLayout />}>
        {/* PUBLIC tenant routes - no guard */}
        <Route index element={<TenantLanding />} />
        <Route path="login" element={<AthleteLogin />} />
        <Route path="verify/card/:cardId" element={<VerifyCard />} />
        <Route path="verify/diploma/:diplomaId" element={<VerifyDiploma />} />
        <Route path="verify/membership/:membershipId" element={<VerifyMembership />} />
        <Route path="academies" element={<PublicAcademies />} />
        <Route path="rankings" element={<PublicRankings />} />
        <Route path="events" element={<PublicEventsList />} />
        <Route path="events/:eventId" element={<PublicEventDetails />} />
        
        {/* PUBLIC membership routes */}
        <Route path="membership/new" element={<MembershipTypeSelector />} />
        <Route path="membership/adult" element={<AdultMembershipForm />} />
        <Route path="membership/youth" element={<YouthMembershipForm />} />
        <Route path="membership/success" element={<MembershipSuccess />} />
        
        {/* PROTECTED membership routes - RequireRoles only (IdentityGate in parent) */}
        <Route path="membership/status" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL}>
              <MembershipStatus />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="membership/renew" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL}>
              <MembershipRenew />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* 🔐 ATHLETE PORTAL - protected */}
        <Route path="portal" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL}>
              <AthletePortal />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="portal/events" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_EVENTS}>
              <PortalEvents />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="portal/card" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_CARD}>
              <PortalCard />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* 🔐 TENANT APP ROUTES - protected with RequireRoles */}
        <Route path="app/onboarding" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_SETTINGS}>
              <TenantOnboarding />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
              <TenantDashboard />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/memberships" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
              <MembershipList />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="app/memberships/:membershipId" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
              <MembershipDetails />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/academies" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_ACADEMIES}>
              <AcademiesList />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/coaches" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_COACHES}>
              <CoachesList />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* 🔐 SENSITIVE: Approval flow */}
        <Route path="app/approvals" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_APPROVALS}>
              <ApprovalsList />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="app/approvals/:membershipId" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_APPROVALS}>
              <ApprovalDetails />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/grading-schemes" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_GRADINGS}>
              <GradingSchemesList />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="app/grading-schemes/:schemeId/levels" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_GRADINGS}>
              <GradingLevelsList />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/athletes" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_ATHLETES}>
              <AthletesList />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="app/athletes/:athleteId/gradings" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_ATHLETES}>
              <AthleteGradingsPage />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/rankings" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_RANKINGS}>
              <InternalRankings />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/settings" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_SETTINGS}>
              <TenantSettings />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* 🔐 SENSITIVE: Billing - admin only */}
        <Route path="app/billing" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_BILLING}>
              <TenantBilling />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/me" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_MY_AREA}>
              <AthleteArea />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/help" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_HELP}>
              <TenantHelp />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/audit-log" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_AUDIT_LOG}>
              <AuditLog />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* 🔐 SENSITIVE: Security timeline - admin only */}
        <Route path="app/security" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_SECURITY}>
              <SecurityTimeline />
            </RequireRoles>
          </IdentityGate>
        } />
        
        <Route path="app/events" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_EVENTS}>
              <EventsList />
            </RequireRoles>
          </IdentityGate>
        } />
        <Route path="app/events/:eventId" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_EVENTS}>
              <EventDetails />
            </RequireRoles>
          </IdentityGate>
        } />
        
        {/* Catch-all for /app/* - redirect unknown routes to dashboard */}
        <Route path="app/*" element={
          <IdentityGate>
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
              <TenantDashboard />
            </RequireRoles>
          </IdentityGate>
        } />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
