/**
 * 🔐 JOIN CONTEXT — Wizard State Management
 * 
 * Manages the mandatory onboarding wizard state.
 * Ensures no user is created without a tenant context.
 * 
 * RULES:
 * - Tenant MUST be selected before account creation
 * - Session persists across wizard steps
 * - Context is cleared on successful membership creation
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from '@/lib/logger';

export interface SelectedTenant {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  city?: string | null;
  sportTypes?: string[];
}

interface JoinContextType {
  selectedTenant: SelectedTenant | null;
  setSelectedTenant: (tenant: SelectedTenant | null) => void;
  clearWizardState: () => void;
  isWizardComplete: boolean;
  setWizardComplete: (complete: boolean) => void;
}

const JoinContext = createContext<JoinContextType | undefined>(undefined);

const STORAGE_KEY = 'tatame_join_wizard_state';

interface StoredState {
  selectedTenant: SelectedTenant | null;
  timestamp: number;
}

// Wizard state expires after 1 hour
const STATE_TTL_MS = 60 * 60 * 1000;

export function JoinProvider({ children }: { children: ReactNode }) {
  const [selectedTenant, setSelectedTenantState] = useState<SelectedTenant | null>(null);
  const [isWizardComplete, setWizardComplete] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredState = JSON.parse(stored);
        const isExpired = Date.now() - parsed.timestamp > STATE_TTL_MS;
        
        if (!isExpired && parsed.selectedTenant) {
          setSelectedTenantState(parsed.selectedTenant);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      logger.error('JoinContext: Failed to load persisted state', error);
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setIsInitialized(true);
  }, []);

  // Persist state changes
  useEffect(() => {
    if (!isInitialized) return;
    
    if (selectedTenant) {
      const state: StoredState = {
        selectedTenant,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedTenant, isInitialized]);

  const setSelectedTenant = (tenant: SelectedTenant | null) => {
    setSelectedTenantState(tenant);
  };

  const clearWizardState = () => {
    setSelectedTenantState(null);
    setWizardComplete(false);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <JoinContext.Provider
      value={{
        selectedTenant,
        setSelectedTenant,
        clearWizardState,
        isWizardComplete,
        setWizardComplete,
      }}
    >
      {children}
    </JoinContext.Provider>
  );
}

export function useJoin() {
  const context = useContext(JoinContext);
  if (context === undefined) {
    throw new Error('useJoin must be used within a JoinProvider');
  }
  return context;
}
