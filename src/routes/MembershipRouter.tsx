import { Routes, Route } from 'react-router-dom';
import MembershipNew from '@/pages/MembershipNew';
import MembershipAdult from '@/pages/MembershipAdult';
import MembershipYouth from '@/pages/MembershipYouth';
import MembershipRenew from '@/pages/MembershipRenew';
import MembershipSuccessPage from '@/pages/MembershipSuccessPage';
import MembershipStatus from '@/pages/MembershipStatus';
import NotFound from '@/pages/NotFound';

export default function MembershipRouter() {
  return (
    <Routes>
      {/* AJUSTE 2: Index renderiza MembershipNew diretamente (sem redirect) */}
      <Route index element={<MembershipNew />} />
      <Route path="new" element={<MembershipNew />} />
      <Route path="adult" element={<MembershipAdult />} />
      <Route path="youth" element={<MembershipYouth />} />
      <Route path="renew" element={<MembershipRenew />} />
      <Route path="success" element={<MembershipSuccessPage />} />
      <Route path="status" element={<MembershipStatus />} />
      {/* AJUSTE 3: Fallback estatico (sem redirect) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
