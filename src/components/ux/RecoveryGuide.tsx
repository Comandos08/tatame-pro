/**
 * 🛡️ RECOVERY GUIDE — Humanized Error Recovery Component
 * 
 * CONSTRAINTS (per approval):
 * 1. Pure UI component — no business logic
 * 2. Reusable across all recovery scenarios
 * 3. No redirects, no side effects
 * 4. All text via i18n
 * 
 * Purpose: Guide users through blocked, incomplete, or error states
 * with clear messaging and actionable escape hatches.
 */


import { Clock, Lock, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export type RecoveryVariant = 
  | 'pending'      // Awaiting approval/review
  | 'blocked'      // Temporarily blocked
  | 'incomplete'   // Setup/registration incomplete
  | 'expired'      // Session/membership expired
  | 'error';       // Generic error state

export interface RecoveryAction {
  labelKey: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

export interface RecoveryGuideProps {
  /** Recovery scenario variant */
  variant: RecoveryVariant;
  
  /** Optional custom title (i18n key) - overrides variant default */
  titleKey?: string;
  
  /** Optional custom description (i18n key) - overrides variant default */
  descriptionKey?: string;
  
  /** Optional custom suggestion (i18n key) - overrides variant default */
  suggestionKey?: string;
  
  /** Action buttons - if not provided, uses variant defaults */
  actions?: RecoveryAction[];
  
  /** Additional className for the container */
  className?: string;
}

interface VariantConfig {
  icon: React.ComponentType<Record<string, unknown>>;
  iconColorClass: string;
  bgColorClass: string;
  titleKey: string;
  descriptionKey: string;
  suggestionKey: string;
}

const VARIANT_CONFIGS: Record<RecoveryVariant, VariantConfig> = {
  pending: {
    icon: Clock,
    iconColorClass: 'text-warning',
    bgColorClass: 'bg-warning/10',
    titleKey: 'recovery.pending.title',
    descriptionKey: 'recovery.pending.description',
    suggestionKey: 'recovery.pending.suggestion',
  },
  blocked: {
    icon: Lock,
    iconColorClass: 'text-destructive',
    bgColorClass: 'bg-destructive/10',
    titleKey: 'recovery.blocked.title',
    descriptionKey: 'recovery.blocked.description',
    suggestionKey: 'recovery.blocked.suggestion',
  },
  incomplete: {
    icon: AlertCircle,
    iconColorClass: 'text-warning',
    bgColorClass: 'bg-warning/10',
    titleKey: 'recovery.incomplete.title',
    descriptionKey: 'recovery.incomplete.description',
    suggestionKey: 'recovery.incomplete.suggestion',
  },
  expired: {
    icon: RefreshCw,
    iconColorClass: 'text-muted-foreground',
    bgColorClass: 'bg-muted',
    titleKey: 'recovery.expired.title',
    descriptionKey: 'recovery.expired.description',
    suggestionKey: 'recovery.expired.suggestion',
  },
  error: {
    icon: XCircle,
    iconColorClass: 'text-destructive',
    bgColorClass: 'bg-destructive/10',
    titleKey: 'recovery.error.title',
    descriptionKey: 'recovery.error.description',
    suggestionKey: 'recovery.error.suggestion',
  },
};

export function RecoveryGuide({
  variant,
  titleKey,
  descriptionKey,
  suggestionKey,
  actions,
  className = '',
}: RecoveryGuideProps) {
  const { t } = useI18n();
  
  const config = VARIANT_CONFIGS[variant];
  const IconComponent = config.icon;
  
  // Use custom keys or fallback to variant defaults
  const title = t(titleKey || config.titleKey);
  const description = t(descriptionKey || config.descriptionKey);
  const suggestion = t(suggestionKey || config.suggestionKey);

  return (
    <div className={`min-h-[60vh] flex items-center justify-center p-4 ${className}`}>
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-4 h-16 w-16 rounded-full ${config.bgColorClass} flex items-center justify-center`}>
            <IconComponent className={`h-8 w-8 ${config.iconColorClass}`} />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-base mt-2">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground text-center mb-2">
            {suggestion}
          </p>
          
          {actions && actions.length > 0 && (
            <div className="flex flex-col gap-2">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  onClick={action.onClick}
                  variant={action.variant || 'default'}
                  className="w-full"
                >
                  {action.icon}
                  {t(action.labelKey)}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RecoveryGuide;
