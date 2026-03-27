/**
 * PI U17 — useTrustNarrative (Thin Hook)
 *
 * SRP CONTRACT:
 * - Derives BlockReason from context via U12
 * - Passes to deriveTrustNarrative
 * - No business logic
 */

import { useMemo } from 'react';
import { deriveBlockReason, type BlockReasonContext } from '@/lib/ux/blockReason';
import { deriveTrustNarrative, type TrustNarrative } from '@/lib/ux/trustNarrative';

export function useTrustNarrative(ctx: BlockReasonContext): TrustNarrative | null {
  return useMemo(() => {
    const blockReason = deriveBlockReason(ctx);
    return deriveTrustNarrative(blockReason);
  }, [ctx]);
}
