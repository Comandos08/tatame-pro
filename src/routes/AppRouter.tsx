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
import NotFound from '@/pages/NotFound';

export default function AppRouter() {
  return (
    <Routes>
      <Route index element={<TenantDashboard />} />
      <Route path="me" element={<AthleteArea />} />
      <Route path="athletes" element={<AthletesList />} />
      <Route path="athletes/:athleteId/gradings" element={<AthleteGradingsPage />} />
      <Route path="memberships" element={<MembershipList />} />
      <Route path="memberships/:membershipId" element={<MembershipDetails />} />
      <Route path="academies" element={<AcademiesList />} />
      <Route path="coaches" element={<CoachesList />} />
      <Route path="grading-schemes" element={<GradingSchemesList />} />
      <Route path="grading-schemes/:schemeId/levels" element={<GradingLevelsList />} />
      <Route path="approvals" element={<ApprovalsList />} />
      <Route path="approvals/:approvalId" element={<ApprovalDetails />} />
      <Route path="rankings" element={<InternalRankings />} />
      <Route path="events" element={<EventsList />} />
      <Route path="events/:eventId" element={<EventDetails />} />
      <Route path="audit-log" element={<AuditLog />} />
      <Route path="security" element={<SecurityTimeline />} />
      <Route path="billing" element={<TenantBilling />} />
      <Route path="settings" element={<TenantSettings />} />
      <Route path="onboarding" element={<TenantOnboarding />} />
      <Route path="help" element={<TenantHelp />} />
      {/* AJUSTE 3: Fallback estatico (sem redirect) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
