/**
 * usePendingApprovalsCount — P2.4
 *
 * Returns the count of memberships with status PENDING_REVIEW for a tenant,
 * with a Supabase Realtime subscription to update the count instantly when
 * new applications arrive or existing ones change status.
 */
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePendingApprovalsCount(tenantId: string | undefined): number {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setCount(0);
      return;
    }

    // Initial fetch
    let cancelled = false;

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'PENDING_REVIEW');
      if (!cancelled) setCount(c ?? 0);
    };

    fetchCount();

    // Realtime subscription — refetch on any INSERT/UPDATE to memberships
    const channelName = `pending-approvals-count-${tenantId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memberships',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Refetch count on any change — simpler and accurate
          fetchCount();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tenantId]);

  return count;
}
