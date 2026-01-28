import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

// 🔐 CONTEXTS (ORDEM IMPORTA)
import { AuthProvider } from "@/contexts/AuthContext";
import { IdentityProvider } from "@/contexts/IdentityContext";

// 🌍 I18N
import { I18nProvider } from "@/contexts/I18nContext";

// 🎨 STYLES
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <IdentityProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </IdentityProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
