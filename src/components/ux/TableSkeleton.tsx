/**
 * ============================================================================
 * 📊 TABLE SKELETON — Loading placeholder for tables
 * ============================================================================
 * 
 * P1.4: Skeleton component for table loading states.
 * Shows structure while data is loading for premium perception.
 * ============================================================================
 */


import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface TableSkeletonProps {
  /** Number of columns to render */
  columns: number;
  /** Number of rows to render (default: 5) */
  rows?: number;
  /** Optional className */
  className?: string;
}

export function TableSkeleton({ columns, rows = 5, className }: TableSkeletonProps) {
  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton 
                    className={cn(
                      'h-4',
                      colIndex === 0 ? 'w-32' : 'w-20'
                    )} 
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default TableSkeleton;
