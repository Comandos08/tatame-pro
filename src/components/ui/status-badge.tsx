import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// Centralized status color configuration
const statusVariants = cva(
  "inline-flex items-center gap-1.5 font-medium",
  {
    variants: {
      status: {
        // Membership statuses
        DRAFT: "bg-muted text-muted-foreground",
        PENDING_PAYMENT: "bg-warning/20 text-warning border-warning/30",
        PENDING_REVIEW: "bg-warning/20 text-warning border-warning/30",
        APPROVED: "bg-info/20 text-info border-info/30",
        ACTIVE: "bg-success/20 text-success border-success/30",
        EXPIRED: "bg-destructive/20 text-destructive border-destructive/30",
        CANCELLED: "bg-destructive/20 text-destructive border-destructive/30",
        REJECTED: "bg-destructive/20 text-destructive border-destructive/30",
        ADMIN_ACTIVE: "bg-info/20 text-info border-info/30",
        
        // Billing statuses
        TRIALING: "bg-info/20 text-info border-info/30",
        PAST_DUE: "bg-warning/20 text-warning border-warning/30",
        INCOMPLETE: "bg-muted text-muted-foreground",
        UNPAID: "bg-destructive/20 text-destructive border-destructive/30",
        
        // Diploma statuses
        ISSUED: "bg-success/20 text-success border-success/30",
        REVOKED: "bg-destructive/20 text-destructive border-destructive/30",
        
        // Payment statuses
        PAID: "bg-success/20 text-success border-success/30",
        NOT_PAID: "bg-muted text-muted-foreground",
        FAILED: "bg-destructive/20 text-destructive border-destructive/30",
        WAIVED: "bg-info/20 text-info border-info/30",
        
        // Generic statuses
        success: "bg-success/20 text-success border-success/30",
        warning: "bg-warning/20 text-warning border-warning/30",
        error: "bg-destructive/20 text-destructive border-destructive/30",
        info: "bg-info/20 text-info border-info/30",
        neutral: "bg-muted text-muted-foreground",
      },
      size: {
        sm: "text-xs px-2 py-0.5",
        default: "text-sm px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
    },
    defaultVariants: {
      status: "neutral",
      size: "default",
    },
  }
);

// P4B-5A: Labels are now handled via i18n by the caller
// Use the `label` prop to pass translated text
// Fallback: displays the status value as-is

export type StatusType = NonNullable<VariantProps<typeof statusVariants>["status"]>;

interface StatusBadgeProps extends Omit<VariantProps<typeof statusVariants>, "status"> {
  status: StatusType;
  label?: string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ 
  status, 
  label, 
  size,
  className,
  showDot = false,
}: StatusBadgeProps) {
  // P4B-5A: label prop is required for i18n, fallback to status string
  const displayLabel = label || status;
  
  return (
    <Badge 
      variant="outline"
      className={cn(statusVariants({ status, size }), className)}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {displayLabel}
    </Badge>
  );
}

// Export status colors for use in other components (e.g., charts)
export const STATUS_COLORS: Record<StatusType, string> = {
  DRAFT: "hsl(var(--muted-foreground))",
  PENDING_PAYMENT: "hsl(var(--warning))",
  PENDING_REVIEW: "hsl(var(--warning))",
  APPROVED: "hsl(var(--info))",
  ACTIVE: "hsl(var(--success))",
  EXPIRED: "hsl(var(--destructive))",
  CANCELLED: "hsl(var(--destructive))",
  REJECTED: "hsl(var(--destructive))",
  ADMIN_ACTIVE: "hsl(var(--info))",
  TRIALING: "hsl(var(--info))",
  PAST_DUE: "hsl(var(--warning))",
  INCOMPLETE: "hsl(var(--muted-foreground))",
  UNPAID: "hsl(var(--destructive))",
  ISSUED: "hsl(var(--success))",
  REVOKED: "hsl(var(--destructive))",
  PAID: "hsl(var(--success))",
  NOT_PAID: "hsl(var(--muted-foreground))",
  FAILED: "hsl(var(--destructive))",
  WAIVED: "hsl(var(--info))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  error: "hsl(var(--destructive))",
  info: "hsl(var(--info))",
  neutral: "hsl(var(--muted-foreground))",
};

// Helper to get status color for charts/icons
export function getStatusColor(status: StatusType): string {
  return STATUS_COLORS[status] || STATUS_COLORS.neutral;
}
