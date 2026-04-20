import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { safeOpen } from '@/lib/safeOpen';

interface DownloadState {
  isLoading: boolean;
  error: string | null;
}

export function useSecureDocumentDownload() {
  const [downloadState, setDownloadState] = useState<Record<string, DownloadState>>({});

  const downloadDocument = async (documentId: string): Promise<void> => {
    setDownloadState((prev) => ({
      ...prev,
      [documentId]: { isLoading: true, error: null },
    }));

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData?.session) {
        throw new Error('Você precisa estar autenticado para baixar documentos');
      }

      const { data, error } = await supabase.functions.invoke('get-document', {
        body: { documentId },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao solicitar documento');
      }

      if (!data?.signedUrl) {
        throw new Error('URL de download não retornada');
      }

      // Open the signed URL in a new tab
      safeOpen(data.signedUrl);

      setDownloadState((prev) => ({
        ...prev,
        [documentId]: { isLoading: false, error: null },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      // Check for specific error messages
      if (errorMessage.includes('Forbidden') || errorMessage.includes('permission')) {
        toast.error('Você não tem permissão para acessar este documento');
      } else if (errorMessage.includes('Unauthorized')) {
        toast.error('Faça login para acessar este documento');
      } else {
        toast.error(`Erro ao baixar documento: ${errorMessage}`);
      }

      setDownloadState((prev) => ({
        ...prev,
        [documentId]: { isLoading: false, error: errorMessage },
      }));
    }
  };

  const isDownloading = (documentId: string): boolean => {
    return downloadState[documentId]?.isLoading ?? false;
  };

  const getError = (documentId: string): string | null => {
    return downloadState[documentId]?.error ?? null;
  };

  return {
    downloadDocument,
    isDownloading,
    getError,
  };
}
