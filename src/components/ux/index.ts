/**
 * 🎨 UX Components — Unified User Experience
 * 
 * P1: Reusable components for consistent UX across the platform.
 */

// P1.1 — Blocked State Card (unified blocking/error UI)
export { BlockedStateCard, type BlockedStateCardProps, type BlockedStateAction } from './BlockedStateCard';

// P1.2 — Loading State (intentional loading messages)
export { LoadingState, type LoadingStateProps } from './LoadingState';

// P1.4 — Skeletons (premium loading perception)
export { TableSkeleton, type TableSkeletonProps } from './TableSkeleton';
export { CardGridSkeleton, type CardGridSkeletonProps } from './CardGridSkeleton';

// Existing
export { RecoveryGuide } from './RecoveryGuide';
