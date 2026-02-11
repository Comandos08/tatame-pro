/**
 * ============================================================================
 * 🃏 CARD GRID SKELETON — Loading placeholder for card grids
 * ============================================================================
 * 
 * P1.4: Skeleton component for card grid loading states.
 * Shows structure while data is loading for premium perception.
 * ============================================================================
 */


import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CardGridSkeletonProps {
  /** Number of cards to render (default: 4) */
  cards?: number;
  /** Grid columns (default: 4) */
  columns?: 2 | 3 | 4 | 5;
  /** Optional className */
  className?: string;
}

const columnClasses = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
} as const;

export function CardGridSkeleton({ cards = 4, columns = 4, className }: CardGridSkeletonProps) {
  return (
    <div className={cn('grid gap-4', columnClasses[columns], className)}>
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default CardGridSkeleton;
