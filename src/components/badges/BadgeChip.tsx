import React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Award } from "lucide-react";

interface BadgeChipProps {
  name: string;
  description?: string | null;
  className?: string;
}

/**
 * BadgeChip — Exibição read-only de reconhecimento simbólico.
 *
 * Visual neutro, sem cor de ação, cursor default.
 * Tooltip explica que badge é simbólico e não concede permissões.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function BadgeChip({ name, description, className }: BadgeChipProps) {
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
          >
            <Award className="h-3 w-3 shrink-0" />
            {name}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{name}</p>
          {description && <p className="text-muted-foreground mt-0.5">{description}</p>}
          <p className="text-muted-foreground/70 mt-1 italic text-[10px]">
            Reconhecimento simbólico. Não concede permissões.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
