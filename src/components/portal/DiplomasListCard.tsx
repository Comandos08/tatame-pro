import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Award, Download, ExternalLink, FileText } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';

interface DiplomaData {
  id: string;
  serial_number: string;
  promotion_date: string;
  status: string;
  pdf_url: string | null;
  grading_level_id: string;
}

interface DiplomasListCardProps {
  diplomas: DiplomaData[];
  tenantSlug: string;
}

export function DiplomasListCard({ diplomas, tenantSlug }: DiplomasListCardProps) {
  const { t, locale } = useI18n();

  const getDateLocale = () => {
    switch (locale) {
      case 'en':
        return enUS;
      case 'es':
        return es;
      default:
        return ptBR;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = (pdfUrl: string) => {
    window.open(pdfUrl, '_blank');
  };

  const handleVerify = (diplomaId: string) => {
    window.open(`/${tenantSlug}/verify/diploma/${diplomaId}`, '_blank');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 text-primary" />
          {t('portal.diplomas')}
          {diplomas.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {diplomas.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {diplomas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t('portal.noDiplomas')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {diplomas.map((diploma) => (
              <div
                key={diploma.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {diploma.serial_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(diploma.promotion_date)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {diploma.pdf_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(diploma.pdf_url!)}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleVerify(diploma.id)}
                    title="Verificar"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
