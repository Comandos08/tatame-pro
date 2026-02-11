/**
 * 🔍 JobsHealthCard — P4.1.B
 * 
 * Card showing status of all background jobs with individual indicators.
 */


import { Clock, CheckCircle, AlertTriangle, XCircle, HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';
import { useJobsHealth } from '@/hooks/useSystemHealthStatus';
import { JobStatus, getJobDisplayName } from '@/types/observability';
import { formatRelativeTime } from '@/lib/i18n/formatters';
import { cn } from '@/lib/utils';

const statusIcons = {
  OK: CheckCircle,
  DELAYED: AlertTriangle,
  FAILED: XCircle,
  NEVER_RAN: HelpCircle,
};

const statusColors = {
  OK: 'text-success',
  DELAYED: 'text-warning',
  FAILED: 'text-destructive',
  NEVER_RAN: 'text-muted-foreground',
};

function JobRow({ job }: { job: JobStatus }) {
  const { t, locale } = useI18n();
  const Icon = statusIcons[job.status];
  const colorClass = statusColors[job.status];
  
  const lastRunText = job.last_run_at 
    ? formatRelativeTime(job.last_run_at, locale)
    : t('observability.jobs.neverRan');
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4', colorClass)} />
        <div>
          <p className="text-sm font-medium">{getJobDisplayName(job.job_name)}</p>
          <p className="text-xs text-muted-foreground">
            {lastRunText}
          </p>
        </div>
      </div>
      <div className="text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-xs text-muted-foreground cursor-help">
              <span className="font-medium">{job.runs_24h}</span> runs / 24h
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p>{job.success_24h} successful</p>
              <p>{job.failures_24h} failed</p>
              <p>{job.items_processed_24h} items processed</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function JobsHealthCard() {
  const { t } = useI18n();
  const { data: jobs, isLoading, refetch, isFetching } = useJobsHealth();
  
  const okCount = jobs?.filter(j => j.status === 'OK').length || 0;
  const totalCount = jobs?.length || 0;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('observability.jobs.title')}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
        <CardDescription className="text-xs">
          {t('observability.jobs.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs && jobs.length > 0 ? (
          <>
            <div className="mb-4 p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold text-primary">{okCount}/{totalCount}</p>
              <p className="text-xs text-muted-foreground">{t('observability.jobs.healthy')}</p>
            </div>
            <div className="space-y-1">
              {jobs.map((job) => (
                <JobRow key={job.job_name} job={job} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('observability.jobs.noData')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
