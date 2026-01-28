import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

import Login from "@/pages/Login";
import PortalRouter from "@/pages/PortalRouter";
import IdentityWizard from "@/pages/IdentityWizard";
import AuthCallback from "@/pages/AuthCallback";

export default function App() {
  return (
    <IdentityGate>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Identity */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />

        {/* Protected */}
        <Route path="/*" element={<PortalRouter />} />
      </Routes>
    </IdentityGate>
  );
}
