import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useCurrentUser } from '@/contexts/AuthContext';

// Pages
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import AdminDashboard from '@/pages/AdminDashboard';
import TenantLanding from '@/pages/TenantLanding';
import TenantDashboard from '@/pages/TenantDashboard';
import MembershipList from '@/pages/MembershipList';
import MembershipDetails from '@/pages/MembershipDetails';
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
import NotFound from '@/pages/NotFound';

// Membership components
import { MembershipTypeSelector } from '@/components/membership/MembershipTypeSelector';
import { AdultMembershipForm } from '@/components/membership/AdultMembershipForm';
import { YouthMembershipForm } from '@/components/membership/YouthMembershipForm';
import { MembershipSuccess } from '@/components/membership/MembershipSuccess';

// Layouts
import { TenantLayout } from '@/layouts/TenantLayout';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Admin route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isGlobalSuperadmin, isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isGlobalSuperadmin) {
    return <Navigate to="/" replace />;
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

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />

      {/* Tenant routes */}
      <Route path="/:tenantSlug" element={<TenantLayout />}>
        {/* Public tenant landing */}
        <Route index element={<TenantLanding />} />
        
        {/* Public verification routes */}
        <Route path="verify/card/:cardId" element={<VerifyCard />} />
        <Route path="verify/diploma/:diplomaId" element={<VerifyDiploma />} />
        
        {/* Public membership routes */}
        <Route path="membership/new" element={<MembershipTypeSelector />} />
        <Route path="membership/adult" element={<AdultMembershipForm />} />
        <Route path="membership/youth" element={<YouthMembershipForm />} />
        <Route path="membership/success" element={<MembershipSuccess />} />
        
        {/* Protected tenant app */}
        <Route path="app" element={<ProtectedRoute><TenantDashboard /></ProtectedRoute>} />
        <Route path="app/memberships" element={<ProtectedRoute><MembershipList /></ProtectedRoute>} />
        <Route path="app/memberships/:membershipId" element={<ProtectedRoute><MembershipDetails /></ProtectedRoute>} />
        <Route path="app/academies" element={<ProtectedRoute><AcademiesList /></ProtectedRoute>} />
        <Route path="app/coaches" element={<ProtectedRoute><CoachesList /></ProtectedRoute>} />
        <Route path="app/approvals" element={<ProtectedRoute><ApprovalsList /></ProtectedRoute>} />
        <Route path="app/approvals/:membershipId" element={<ProtectedRoute><ApprovalDetails /></ProtectedRoute>} />
        <Route path="app/grading-schemes" element={<ProtectedRoute><GradingSchemesList /></ProtectedRoute>} />
        <Route path="app/grading-schemes/:schemeId/levels" element={<ProtectedRoute><GradingLevelsList /></ProtectedRoute>} />
        <Route path="app/athletes" element={<ProtectedRoute><AthletesList /></ProtectedRoute>} />
        <Route path="app/athletes/:athleteId/gradings" element={<ProtectedRoute><AthleteGradingsPage /></ProtectedRoute>} />
        <Route path="app/*" element={<ProtectedRoute><TenantDashboard /></ProtectedRoute>} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}