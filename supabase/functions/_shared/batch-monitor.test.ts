/**
 * Contract tests for reportBatchOutcome.
 *
 * Every cron job that processes a batch ends with a call to this helper.
 * If we get the threshold wrong, the on-call surface either:
 *   - silently misses a broken batch (no page, integrity drifts), or
 *   - pages on every flake (alert fatigue, real critical signal lost).
 *
 * Pin: empty batch → silent; clean batch → silent; sub-threshold failures
 * → warn (not critical); above-threshold failures → critical; absolute
 * floor blocks "1 of 1 failed = 100%" noise; payload carries the metrics
 * needed to triage from the log line alone.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  reportBatchOutcome,
  type BatchOutcomeLogger,
} from "./batch-monitor.ts";

// =============================================================================
// Recording logger stub
// =============================================================================

interface LogCall {
  level: "warn" | "critical";
  msg: string;
  err?: unknown;
  data?: Record<string, unknown>;
}

function makeRecordingLogger(): BatchOutcomeLogger & { calls: LogCall[] } {
  const calls: LogCall[] = [];
  return {
    calls,
    warn(msg, data) {
      calls.push({ level: "warn", msg, data });
    },
    critical(msg, err, data) {
      calls.push({ level: "critical", msg, err, data });
    },
  };
}

// =============================================================================
// Empty batch
// =============================================================================

Deno.test("reportBatchOutcome: empty batch (0/0) → silent, ratio 0, not alerted", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 0,
    failed: 0,
  });
  assertEquals(result, { failureRatio: 0, alerted: false });
  assertEquals(log.calls.length, 0);
});

// =============================================================================
// Clean batch — fully successful
// =============================================================================

Deno.test("reportBatchOutcome: 100 succeeded / 0 failed → silent", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 100,
    failed: 0,
  });
  assertEquals(result.failureRatio, 0);
  assertFalse(result.alerted);
  assertEquals(log.calls.length, 0);
});

Deno.test("reportBatchOutcome: 1 succeeded / 0 failed → silent", () => {
  // Smallest non-empty clean batch — must not page.
  const log = makeRecordingLogger();
  reportBatchOutcome(log, {
    jobName: "mark-pending-delete",
    succeeded: 1,
    failed: 0,
  });
  assertEquals(log.calls.length, 0);
});

// =============================================================================
// Below threshold — warn, not critical
// =============================================================================

Deno.test("reportBatchOutcome: 95 succeeded / 5 failed (5%) → warn", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 95,
    failed: 5,
  });
  assertFalse(result.alerted);
  assertEquals(log.calls.length, 1);
  assertEquals(log.calls[0].level, "warn");
  assertEquals(log.calls[0].data?.succeeded, 95);
  assertEquals(log.calls[0].data?.failed, 5);
  assertEquals(log.calls[0].data?.considered, 100);
  assertEquals(log.calls[0].data?.failure_ratio, 0.05);
});

Deno.test("reportBatchOutcome: 60 succeeded / 40 failed (40%) → warn", () => {
  // Just under the 50% ratio — still only a warn, not a page.
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "mark-pending-delete",
    succeeded: 60,
    failed: 40,
  });
  assertFalse(result.alerted);
  assertEquals(log.calls[0].level, "warn");
});

// =============================================================================
// Above threshold + above minimum floor — critical
// =============================================================================

Deno.test("reportBatchOutcome: 5 succeeded / 5 failed (50%) → critical (boundary)", () => {
  // Exactly at the 50% threshold (>=) and above the default minFailures=3.
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 5,
    failed: 5,
  });
  assert(result.alerted);
  assertEquals(result.failureRatio, 0.5);
  assertEquals(log.calls.length, 1);
  assertEquals(log.calls[0].level, "critical");
  // Critical message includes the job name so the alert is self-describing.
  assert(log.calls[0].msg.includes("expire-trials"));
});

Deno.test("reportBatchOutcome: 0 succeeded / 100 failed (100%) → critical", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "cleanup-expired-tenants",
    succeeded: 0,
    failed: 100,
  });
  assert(result.alerted);
  assertEquals(result.failureRatio, 1);
  assertEquals(log.calls[0].level, "critical");
});

Deno.test("reportBatchOutcome: 2 succeeded / 8 failed (80%) → critical", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "mark-pending-delete",
    succeeded: 2,
    failed: 8,
  });
  assert(result.alerted);
  assertEquals(log.calls[0].level, "critical");
});

// =============================================================================
// Absolute floor (minFailures) gate
// =============================================================================

Deno.test("reportBatchOutcome: 0 succeeded / 1 failed (100%) → warn (below default minFailures=3)", () => {
  // 100% failure rate but only 1 absolute failure — must NOT page.
  // This is the "noisy small batch" guard.
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 0,
    failed: 1,
  });
  assertFalse(result.alerted);
  assertEquals(log.calls[0].level, "warn");
});

Deno.test("reportBatchOutcome: 0 succeeded / 2 failed (100%) → warn (below default minFailures=3)", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 0,
    failed: 2,
  });
  assertFalse(result.alerted);
});

Deno.test("reportBatchOutcome: 0 succeeded / 3 failed (100%) → critical (exactly at default floor)", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 0,
    failed: 3,
  });
  assert(result.alerted);
});

Deno.test("reportBatchOutcome: custom minFailures=1 allows page on tiny batches", () => {
  // Caller opts in to noisier alerts for a high-stakes job.
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "critical-cron",
    succeeded: 0,
    failed: 1,
    minFailures: 1,
  });
  assert(result.alerted);
});

// =============================================================================
// Custom thresholdRatio
// =============================================================================

Deno.test("reportBatchOutcome: thresholdRatio=0.1 → critical at 10% with 5 failures", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "strict-job",
    succeeded: 45,
    failed: 5,
    thresholdRatio: 0.1,
  });
  assert(result.alerted);
});

Deno.test("reportBatchOutcome: thresholdRatio=0.9 → only critical at 90%+", () => {
  const log = makeRecordingLogger();
  const result = reportBatchOutcome(log, {
    jobName: "tolerant-job",
    succeeded: 20,
    failed: 80,
    thresholdRatio: 0.9,
  });
  // 80/100 = 0.8 < 0.9 → warn, not critical
  assertFalse(result.alerted);
  assertEquals(log.calls[0].level, "warn");
});

// =============================================================================
// Payload shape — what triage sees in the log
// =============================================================================

Deno.test("reportBatchOutcome: payload carries all metrics + caller metadata", () => {
  const log = makeRecordingLogger();
  reportBatchOutcome(log, {
    jobName: "expire-trials",
    succeeded: 10,
    failed: 10,
    metadata: {
      correlation_id: "corr-123",
      cron_run_id: "run-456",
    },
  });
  const data = log.calls[0].data!;
  assertEquals(data.job, "expire-trials");
  assertEquals(data.succeeded, 10);
  assertEquals(data.failed, 10);
  assertEquals(data.considered, 20);
  assertEquals(data.failure_ratio, 0.5);
  assertEquals(data.threshold_ratio, 0.5);
  assertEquals(data.min_failures, 3);
  assertEquals(data.correlation_id, "corr-123");
  assertEquals(data.cron_run_id, "run-456");
});

Deno.test("reportBatchOutcome: failure_ratio rounded to 4 decimal places", () => {
  // 1/3 = 0.3333... — keep the log payload readable, don't dump 17 digits.
  const log = makeRecordingLogger();
  reportBatchOutcome(log, {
    jobName: "rounding-test",
    succeeded: 2,
    failed: 1,
  });
  assertEquals(log.calls[0].data?.failure_ratio, 0.3333);
});

Deno.test("reportBatchOutcome: critical level used (not warn) when threshold breached", () => {
  // Smoke test: at 5/5 the critical path MUST fire and the warn path
  // MUST NOT — they're mutually exclusive in the source.
  const log = makeRecordingLogger();
  reportBatchOutcome(log, {
    jobName: "x",
    succeeded: 5,
    failed: 5,
  });
  const levels = log.calls.map((c) => c.level);
  assertEquals(levels, ["critical"]);
});
