import { Routes, Route } from 'react-router-dom';
import TenantDashboard from '@/pages/TenantDashboard';
import AthleteArea from '@/pages/AthleteArea';
import AthletesList from '@/pages/AthletesList';
import AthleteGradingsPage from '@/pages/AthleteGradingsPage';
import MembershipList from '@/pages/MembershipList';
import MembershipDetails from '@/pages/MembershipDetails';
import AcademiesList from '@/pages/AcademiesList';
import CoachesList from '@/pages/CoachesList';
import GradingSchemesList from '@/pages/GradingSchemesList';
import GradingLevelsList from '@/pages/GradingLevelsList';
import ApprovalsList from '@/pages/ApprovalsList';
import ApprovalDetails from '@/pages/ApprovalDetails';
import InternalRankings from '@/pages/InternalRankings';
import EventsList from '@/pages/EventsList';
import EventDetails from '@/pages/EventDetails';
import AuditLog from '@/pages/AuditLog';
import SecurityTimeline from '@/pages/SecurityTimeline';
import TenantBilling from '@/pages/TenantBilling';
import TenantSettings from '@/pages/TenantSettings';
import TenantOnboarding from '@/pages/TenantOnboarding';
import TenantHelp from '@/pages/TenantHelp';
import TenantDiagnostics from '@/pages/TenantDiagnostics';

import NotFound from '@/pages/NotFound';
import { BillingGate } from '@/components/billing/BillingGate';
import { RequireFeature } from '@/components/auth/RequireFeature';

export default function AppRouter() {
  return (
    <Routes>
      <Route index element={<RequireFeature featureKey="TENANT_DASHBOARD"><TenantDashboard /></RequireFeature>} />
      <Route path="me" element={<RequireFeature featureKey="TENANT_MY_AREA"><AthleteArea /></RequireFeature>} />
      <Route path="athletes" element={<RequireFeature featureKey="TENANT_ATHLETES"><AthletesList /></RequireFeature>} />
      <Route path="athletes/:athleteId/gradings" element={<RequireFeature featureKey="TENANT_ATHLETES"><AthleteGradingsPage /></RequireFeature>} />
      <Route path="memberships" element={<RequireFeature featureKey="TENANT_MEMBERSHIPS"><MembershipList /></RequireFeature>} />
      <Route path="memberships/:membershipId" element={<RequireFeature featureKey="TENANT_MEMBERSHIPS"><MembershipDetails /></RequireFeature>} />
      <Route path="academies" element={<RequireFeature featureKey="TENANT_ACADEMIES"><AcademiesList /></RequireFeature>} />
      <Route path="coaches" element={<RequireFeature featureKey="TENANT_COACHES"><CoachesList /></RequireFeature>} />
      <Route path="grading-schemes" element={<RequireFeature featureKey="TENANT_GRADINGS"><GradingSchemesList /></RequireFeature>} />
      <Route path="grading-schemes/:schemeId/levels" element={<RequireFeature featureKey="TENANT_GRADINGS"><GradingLevelsList /></RequireFeature>} />
      <Route path="approvals" element={<RequireFeature featureKey="TENANT_APPROVALS"><ApprovalsList /></RequireFeature>} />
      <Route path="approvals/:approvalId" element={<RequireFeature featureKey="TENANT_APPROVALS"><ApprovalDetails /></RequireFeature>} />
      <Route path="rankings" element={<RequireFeature featureKey="TENANT_RANKINGS"><InternalRankings /></RequireFeature>} />
      {/* P3.4: Events routes wrapped with BillingGate strictMode */}
      <Route path="events" element={<RequireFeature featureKey="TENANT_EVENTS"><BillingGate strictMode><EventsList /></BillingGate></RequireFeature>} />
      <Route path="events/:eventId" element={<RequireFeature featureKey="TENANT_EVENTS"><BillingGate strictMode><EventDetails /></BillingGate></RequireFeature>} />
      <Route path="audit-log" element={<RequireFeature featureKey="TENANT_AUDIT_LOG"><AuditLog /></RequireFeature>} />
      <Route path="security" element={<RequireFeature featureKey="TENANT_SECURITY"><SecurityTimeline /></RequireFeature>} />
      <Route path="billing" element={<RequireFeature featureKey="TENANT_BILLING"><TenantBilling /></RequireFeature>} />
      <Route path="settings" element={<RequireFeature featureKey="TENANT_SETTINGS"><TenantSettings /></RequireFeature>} />
      <Route path="onboarding" element={<TenantOnboarding />} />
      <Route path="diagnostics" element={<TenantDiagnostics />} />
      <Route path="help" element={<RequireFeature featureKey="TENANT_HELP"><TenantHelp /></RequireFeature>} />
      {/* AJUSTE 3: Fallback estatico (sem redirect) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
