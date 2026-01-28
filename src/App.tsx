import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PortalRouter from "@/pages/PortalRouter";
import IdentityWizard from "@/pages/IdentityWizard";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

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

        {/* Protected - todas as outras rotas */}
        <Route path="/portal/*" element={<PortalRouter />} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
