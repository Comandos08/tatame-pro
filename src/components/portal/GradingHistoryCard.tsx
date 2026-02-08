import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, FileText } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate as formatDateUtil } from '@/lib/i18n/formatters';

interface GradingData {
  id: string;
  promotion_date: string;
  grading_level_id: string;
  academy_id: string | null;
  coach_id: string | null;
  notes: string | null;
}

interface GradingHistoryCardProps {
  gradings: GradingData[];
}

export function GradingHistoryCard({ gradings }: GradingHistoryCardProps) {
  const { t, locale } = useI18n();

  const formatDate = (dateStr: string) => {
    return formatDateUtil(dateStr, locale);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          {t('portal.gradingHistory')}
          {gradings.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {gradings.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {gradings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t('portal.noGradings')}</p>
            <p className="text-muted-foreground text-sm mt-1">{t('portal.emptyGradings')}</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

            <div className="space-y-4">
              {gradings.map((grading, index) => (
                <div key={grading.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      index === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted border-2 border-border'
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div
                    className={`flex-1 pb-4 ${
                      index === gradings.length - 1 ? 'pb-0' : ''
                    }`}
                  >
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {formatDate(grading.promotion_date)}
                        </span>
                        {index === 0 && (
                          <Badge className="bg-primary/10 text-primary text-xs">
                            {t('portal.currentGrading')}
                          </Badge>
                        )}
                      </div>
                      {grading.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {grading.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
