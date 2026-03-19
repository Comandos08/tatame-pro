import { useState } from 'react';
import { ShieldCheck, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AuthenticityBadgeProps {
  hash: string;
  verificationUrl?: string;
}

export function AuthenticityBadge({ hash, verificationUrl }: AuthenticityBadgeProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const truncatedHash = hash
    ? `${hash.slice(0, 10)}...${hash.slice(-6)}`
    : '-';

  const handleCopyHash = async () => {
    if (!hash) return;
    
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      toast(t('portal.hashCopied'), { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-muted/50 border">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-green-500" />
        <span className="text-sm font-medium">{t('portal.hashLabel')}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border font-mono truncate">
          {truncatedHash}
        </code>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyHash}
                disabled={!hash}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('portal.copyHash')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {verificationUrl ? (
        <a
          href={verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          {t('portal.viewVerification')}
        </a>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground cursor-not-allowed">
                <ExternalLink className="h-4 w-4" />
                {t('portal.viewVerification')}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Em breve</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
