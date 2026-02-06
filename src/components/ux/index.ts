/**
 * 🎨 UX Components — Unified User Experience
 * 
 * P1: Reusable components for consistent UX across the platform.
 */

// P1.1 — Blocked State Card (unified blocking/error UI)
export { BlockedStateCard, type BlockedStateCardProps, type BlockedStateAction } from './BlockedStateCard';

// P1.2 — Loading State (intentional loading messages)
export { LoadingState, type LoadingStateProps } from './LoadingState';

// P2.5 — Temporary Error Card (transient failure UX)
export { TemporaryErrorCard, type TemporaryErrorCardProps } from './TemporaryErrorCard';

// P1.4 — Skeletons (premium loading perception)
export { TableSkeleton, type TableSkeletonProps } from './TableSkeleton';
export { CardGridSkeleton, type CardGridSkeletonProps } from './CardGridSkeleton';

// P2.1 — Onboarding Progress (visual awareness)
export { 
  OnboardingProgress, 
  type OnboardingProgressProps, 
  type OnboardingProgressStep,
  type OnboardingStepKey,
  type OnboardingStepStatus 
} from './OnboardingProgress';

// P2.6 — Empty State Card (informative absence UX)
export { EmptyStateCard, type EmptyStateCardProps } from './EmptyStateCard';

// Existing
export { RecoveryGuide } from './RecoveryGuide';
