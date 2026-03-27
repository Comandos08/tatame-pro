/**
 * PI U19 — useManifestoMode (Thin Hook)
 *
 * SRP CONTRACT:
 * - Derives BlockReason from context via U12
 * - Passes to deriveManifestoMode
 * - No business logic
 */

import { useMemo } from 'react';
import { deriveBlockReason, type BlockReasonContext } from '@/lib/ux/blockReason';
import { deriveManifestoMode, type Manifesto } from '@/lib/ux/manifestoMode';

export function useManifestoMode(
  ctx: BlockReasonContext,
  isLoading: boolean,
  isError: boolean,
): Manifesto | null {
  return useMemo(() => {
    const blockReason = deriveBlockReason(ctx);
    return deriveManifestoMode(blockReason, isLoading, isError);
  }, [ctx, isLoading, isError]);
}
