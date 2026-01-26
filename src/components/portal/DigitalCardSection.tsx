import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Download, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { AuthenticityBadge } from './AuthenticityBadge';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';

interface DigitalCardData {
  id: string;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  membership_id: string;
}

interface DigitalCardSectionProps {
  digitalCard: DigitalCardData | null;
  athleteName: string;
  tenantSlug: string;
  showFullCardLink?: boolean;
}

export function DigitalCardSection({
  digitalCard,
  athleteName,
  tenantSlug,
  showFullCardLink = false,
}: DigitalCardSectionProps) {
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = () => {
    if (digitalCard?.pdf_url) {
      window.open(digitalCard.pdf_url, '_blank');
    }
  };

  const verificationUrl = digitalCard?.id
    ? `/${tenantSlug}/verify/card/${digitalCard.id}`
    : undefined;

  if (!digitalCard) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5 text-primary" />
            {t('portal.digitalCard')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t('portal.cardNotAvailable')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          {t('portal.digitalCard')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* QR Code */}
          {digitalCard.qr_code_image_url ? (
            <div className="shrink-0">
              <img
                src={digitalCard.qr_code_image_url}
                alt="QR Code"
                className="w-32 h-32 rounded-lg border bg-white p-2"
              />
            </div>
          ) : (
            <div className="w-32 h-32 rounded-lg border bg-muted flex items-center justify-center shrink-0">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          {/* Card Info */}
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Atleta</p>
              <p className="font-medium">{athleteName}</p>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Válido até:</span>
              <Badge variant="outline">{formatDate(digitalCard.valid_until)}</Badge>
            </div>

            {digitalCard.pdf_url && (
              <Button
                variant="tenant-outline"
                size="sm"
                onClick={handleDownload}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t('portal.downloadCard')}
              </Button>
            )}

            {showFullCardLink && (
              <Button variant="link" size="sm" asChild className="gap-1 p-0">
                <Link to={`/${tenantSlug}/portal/card`}>
                  {t('portal.viewFullCard')}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Authenticity Badge */}
        {digitalCard.content_hash_sha256 && (
          <AuthenticityBadge
            hash={digitalCard.content_hash_sha256}
            verificationUrl={verificationUrl}
          />
        )}
      </CardContent>
    </Card>
  );
}
