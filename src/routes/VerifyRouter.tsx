import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const VerifyCard       = lazy(() => import('@/pages/VerifyCard'));
const VerifyDiploma    = lazy(() => import('@/pages/VerifyDiploma'));
const VerifyMembership = lazy(() => import('@/pages/VerifyMembership'));
const NotFound         = lazy(() => import('@/pages/NotFound'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function VerifyRouter() {
  return (
    <ErrorBoundary componentName="VerifyRouter">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="card" element={<VerifyCard />} />
          <Route path="card/:cardId" element={<VerifyCard />} />
          <Route path="diploma" element={<VerifyDiploma />} />
          <Route path="diploma/:diplomaId" element={<VerifyDiploma />} />
          <Route path="membership/:membershipId" element={<VerifyMembership />} />
          {/* AJUSTE 3: Fallback estatico (sem redirect) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
