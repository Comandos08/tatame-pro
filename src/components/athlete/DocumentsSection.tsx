import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  FileCheck, 
  Clock, 
  XCircle, 
  Loader2,
  Download,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSecureDocumentDownload } from '@/hooks/useSecureDocumentDownload';

interface DocumentData {
  id: string;
  type: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  valid_until: string | null;
  created_at: string | null;
}

interface DocumentsSectionProps {
  athleteId: string;
  tenantId: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, { ptBR: string; en: string; es: string }> = {
  ID_DOCUMENT: { ptBR: 'RG / CPF', en: 'ID Document', es: 'Documento ID' },
  MEDICAL_CERTIFICATE: { ptBR: 'Atestado Médico', en: 'Medical Certificate', es: 'Certificado Médico' },
  ADDRESS_PROOF: { ptBR: 'Comprovante de Endereço', en: 'Address Proof', es: 'Comprobante de Dirección' },
  OTHER: { ptBR: 'Outro', en: 'Other', es: 'Otro' },
};

const DOCUMENT_ICONS: Record<string, React.ReactNode> = {
  ID_DOCUMENT: <FileText className="h-5 w-5" />,
  MEDICAL_CERTIFICATE: <FileCheck className="h-5 w-5" />,
  ADDRESS_PROOF: <FileText className="h-5 w-5" />,
  OTHER: <FileText className="h-5 w-5" />,
};

export function DocumentsSection({ athleteId, tenantId }: DocumentsSectionProps) {
  const { t, locale } = useI18n();
  const { downloadDocument, isDownloading } = useSecureDocumentDownload();

  const { data: documents, isLoading } = useQuery({
    queryKey: ['my-documents', athleteId, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id,
          type,
          file_url,
          file_type,
          file_size,
          valid_until,
          created_at
        `)
        .eq('athlete_id', athleteId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DocumentData[];
    },
    enabled: !!athleteId && !!tenantId,
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocumentLabel = (type: string) => {
    const labels = DOCUMENT_TYPE_LABELS[type] || DOCUMENT_TYPE_LABELS.OTHER;
    if (locale === 'en') return labels.en;
    if (locale === 'es') return labels.es;
    return labels.ptBR;
  };

  const getDocumentStatus = (doc: DocumentData) => {
    // If document has valid_until and it's in the past, it's expired
    if (doc.valid_until) {
      const validUntil = new Date(doc.valid_until);
      const now = new Date();
      if (validUntil < now) {
        return 'expired';
      }
    }
    // Otherwise it's valid/approved (we assume documents in DB are approved)
    return 'approved';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-success text-success-foreground">
            <FileCheck className="h-3 w-3 mr-1" />
            {locale === 'en' ? 'Approved' : locale === 'es' ? 'Aprobado' : 'Aprovado'}
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            {locale === 'en' ? 'Expired' : locale === 'es' ? 'Expirado' : 'Expirado'}
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            {locale === 'en' ? 'Pending' : locale === 'es' ? 'Pendiente' : 'Pendente'}
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleDownload = (doc: DocumentData) => {
    downloadDocument(doc.id);
  };

  const getTranslation = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      myDocuments: { ptBR: 'Meus Documentos', en: 'My Documents', es: 'Mis Documentos' },
      myDocumentsDesc: { ptBR: 'Documentos enviados para sua filiação', en: 'Documents uploaded for your membership', es: 'Documentos enviados para tu afiliación' },
      noDocuments: { ptBR: 'Nenhum documento enviado ainda', en: 'No documents uploaded yet', es: 'Ningún documento enviado aún' },
      uploadedAt: { ptBR: 'Enviado em', en: 'Uploaded on', es: 'Enviado el' },
      validUntilDoc: { ptBR: 'Válido até', en: 'Valid until', es: 'Válido hasta' },
    };
    const localeKey = locale === 'en' ? 'en' : locale === 'es' ? 'es' : 'ptBR';
    return translations[key]?.[localeKey] || key;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {getTranslation('myDocuments')}
        </CardTitle>
        <CardDescription>{getTranslation('myDocumentsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !documents?.length ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">{getTranslation('noDocuments')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const status = getDocumentStatus(doc);
              
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      status === 'expired' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                    }`}>
                      {DOCUMENT_ICONS[doc.type] || DOCUMENT_ICONS.OTHER}
                    </div>
                    <div>
                      <p className="font-medium">{getDocumentLabel(doc.type)}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {getTranslation('uploadedAt')}: {formatDate(doc.created_at)}
                        </span>
                        {doc.file_size && (
                          <span>{formatFileSize(doc.file_size)}</span>
                        )}
                        {doc.valid_until && (
                          <span className={status === 'expired' ? 'text-destructive' : ''}>
                            {getTranslation('validUntilDoc')}: {formatDate(doc.valid_until)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(status)}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDownload(doc)}
                      disabled={isDownloading(doc.id)}
                    >
                      {isDownloading(doc.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
