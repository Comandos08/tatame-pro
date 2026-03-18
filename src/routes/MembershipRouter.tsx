import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const MembershipNew         = lazy(() => import('@/pages/MembershipNew'));
const MembershipAdult       = lazy(() => import('@/pages/MembershipAdult'));
const MembershipYouth       = lazy(() => import('@/pages/MembershipYouth'));
const MembershipRenew       = lazy(() => import('@/pages/MembershipRenew'));
const MembershipCheckout    = lazy(() => import('@/pages/MembershipCheckout'));
const MembershipSuccessPage = lazy(() => import('@/pages/MembershipSuccessPage'));
const MembershipStatus      = lazy(() => import('@/pages/MembershipStatus'));
const NotFound              = lazy(() => import('@/pages/NotFound'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function MembershipRouter() {
  return (
    <ErrorBoundary componentName="MembershipRouter">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* AJUSTE 2: Index renderiza MembershipNew diretamente (sem redirect) */}
          <Route index element={<MembershipNew />} />
          <Route path="new" element={<MembershipNew />} />
          <Route path="adult" element={<MembershipAdult />} />
          <Route path="youth" element={<MembershipYouth />} />
          <Route path="renew" element={<MembershipRenew />} />
          <Route path=":membershipId/checkout" element={<MembershipCheckout />} />
          <Route path="success" element={<MembershipSuccessPage />} />
          <Route path="status" element={<MembershipStatus />} />
          {/* AJUSTE 3: Fallback estatico (sem redirect) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
