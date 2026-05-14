/**
 * batch-monitor — Failure-rate signal for cron-driven batch jobs.
 *
 * Cron Edge Functions process N items per invocation (expire-trials,
 * mark-pending-delete, cleanup-expired-tenants, ...). When the failure
 * rate climbs past a threshold, we want a human to look at the
 * dashboard — not a single forgotten log line buried in INFO. This
 * module is the canonical signal:
 *
 *   - succeeded + failed = 0 → no-op (empty batch, no signal possible)
 *   - failed/considered >= thresholdRatio AND failed >= minFailures →
 *     log.critical (fans out to Sentry fatal + notify-critical-alert)
 *   - 0 < failed < threshold → log.warn (visible, not paging)
 *   - failed = 0 → silent (the caller already log.info'd "Job completed")
 *
 * `considered` is `succeeded + failed` ON PURPOSE — items that the job
 * intentionally SKIPPED (e.g. cleanup safeguard tripped) are not in
 * the denominator. Including them would dilute the failure rate and
 * mask a genuinely-broken batch.
 *
 * The minimum-absolute-failures floor (default 3) keeps us from paging
 * on "1 of 1 failed = 100%" noise on small batches. Callers with
 * high-stakes operations can lower it.
 */

export interface BatchOutcomeLogger {
  warn(msg: string, data?: Record<string, unknown>): void;
  critical(msg: string, err?: unknown, data?: Record<string, unknown>): void;
}

export interface BatchOutcome {
  /** Stable name of the cron job, e.g. "expire-trials". */
  jobName: string;
  /** Items the job processed successfully. */
  succeeded: number;
  /** Items the job failed to process. */
  failed: number;
  /**
   * Ratio of (failed / (succeeded + failed)) at which we escalate to
   * log.critical. Default 0.5.
   */
  thresholdRatio?: number;
  /**
   * Minimum absolute failures required to escalate even if the ratio is
   * exceeded. Default 3 — prevents "1 of 1 failed = critical" pages.
   */
  minFailures?: number;
  /** Extra fields merged into the log payload (e.g. correlationId). */
  metadata?: Record<string, unknown>;
}

export interface BatchOutcomeResult {
  /** failed / (succeeded + failed), or 0 when considered is 0. */
  failureRatio: number;
  /** True iff log.critical was invoked. */
  alerted: boolean;
}

/**
 * Evaluate a batch outcome and emit a critical alert when warranted.
 *
 * Returns the computed ratio + whether an alert was fired so callers can
 * include it in their final "Job completed" payload for the audit trail.
 */
export function reportBatchOutcome(
  log: BatchOutcomeLogger,
  outcome: BatchOutcome,
): BatchOutcomeResult {
  const {
    jobName,
    succeeded,
    failed,
    thresholdRatio = 0.5,
    minFailures = 3,
    metadata,
  } = outcome;

  const considered = succeeded + failed;

  // Empty batch — there's nothing to evaluate. Caller's own
  // "Job completed" log line already documents the zero result.
  if (considered === 0) {
    return { failureRatio: 0, alerted: false };
  }

  const failureRatio = failed / considered;
  const payload = {
    job: jobName,
    succeeded,
    failed,
    considered,
    failure_ratio: Number(failureRatio.toFixed(4)),
    threshold_ratio: thresholdRatio,
    min_failures: minFailures,
    ...(metadata ?? {}),
  };

  if (failureRatio >= thresholdRatio && failed >= minFailures) {
    log.critical(
      `Cron batch failure threshold exceeded: ${jobName}`,
      undefined,
      payload,
    );
    return { failureRatio, alerted: true };
  }

  if (failed > 0) {
    log.warn(
      `Cron batch completed with partial failures: ${jobName}`,
      payload,
    );
  }

  return { failureRatio, alerted: false };
}
