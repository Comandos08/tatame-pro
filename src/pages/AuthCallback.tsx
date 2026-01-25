import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useCurrentUser();

  const next = searchParams.get('next') || '/';

  useEffect(() => {
    // Garante que o Supabase finalize a sessão do magic link
    supabase.auth.getSession();
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(next, { replace: true });
    }
  }, [isLoading, isAuthenticated, next, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Finalizando acesso...</p>
      </div>
    </div>
  );
}
