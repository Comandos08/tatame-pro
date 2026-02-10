import React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Award } from "lucide-react";
import type { BadgeSurface } from "@/types/badge";
import { ALLOWED_BADGE_SURFACES } from "@/types/badge";
import { useI18n } from "@/contexts/I18nContext";

interface BadgeChipProps {
  name: string;
  description?: string | null;
  surface: BadgeSurface;
  className?: string;
}

/**
 * BadgeChip — Exibição read-only de reconhecimento simbólico.
 *
 * U14: Badge é identidade secundária visual. Nunca concede acesso.
 * Visual neutro, sem cor de ação, cursor default.
 * Tooltip reforça explicitamente: badge ≠ permissão.
 * D2: Requer surface explícita. DEV guard emite warning se inválida.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function BadgeChip({ name, description, surface, className }: BadgeChipProps) {
  const { t } = useI18n();

  if (import.meta.env.DEV && !ALLOWED_BADGE_SURFACES.includes(surface)) {
    console.warn(
      `[D2] Badge rendered in non-authorized surface: ${surface}`
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground select-none cursor-default",
              className
            )}
            data-testid="badge-chip"
            data-badge-surface={surface}
          >
            <Award className="h-3 w-3 shrink-0" />
            {name}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{name}</p>
          {description && <p className="text-muted-foreground mt-0.5">{description}</p>}
          <p className="text-muted-foreground/70 mt-1 italic text-[10px]">
            {t('badge.recognitionOnly')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
