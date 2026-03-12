import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import VerifyCard from '@/pages/VerifyCard';
import VerifyDiploma from '@/pages/VerifyDiploma';
import VerifyMembership from '@/pages/VerifyMembership';
import NotFound from '@/pages/NotFound';

export default function VerifyRouter() {
  return (
    <ErrorBoundary componentName="VerifyRouter">
    <Routes>
      <Route path="card" element={<VerifyCard />} />
      <Route path="card/:cardId" element={<VerifyCard />} />
      <Route path="diploma" element={<VerifyDiploma />} />
      <Route path="diploma/:diplomaId" element={<VerifyDiploma />} />
      <Route path="membership/:membershipId" element={<VerifyMembership />} />
      {/* AJUSTE 3: Fallback estatico (sem redirect) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </ErrorBoundary>
  );
}
