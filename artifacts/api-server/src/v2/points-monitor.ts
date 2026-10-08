import { createPointsReconciler, type PointsReport } from "./points-reconciliation";

type MonitorLogger = {
  info: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};
export const POINTS_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** One scan at a time per process; the reconciler also locks across API replicas. */
export function startPointsMonitor(
  logger: MonitorLogger,
  reconcile = createPointsReconciler(),
  intervalMs = POINTS_CHECK_INTERVAL_MS,
) {
  let running = false;
  let stopped = false;
  async function check() {
    if (running || stopped) return;
    running = true;
    try {
      const report: PointsReport | null = await reconcile({ scheduled: true });
      if (!report) {
        logger.info({ code: "POINTS_RECONCILIATION_SKIPPED" }, "Points check already running on another replica");
      } else if (report.requiresOperatorReview) {
        // A complete report is available via the operator CLI. Bound individual log records.
        logger.error({ code: "POINTS_RECONCILIATION_DRIFT", checkedAt: report.checkedAt,
          counts: report.counts, findingCount: report.findings.length }, "Points ledger requires operator review");
        for (let i = 0; i < report.findings.length; i += 100) {
          logger.error({ code: "POINTS_RECONCILIATION_FINDINGS", checkedAt: report.checkedAt,
            findings: report.findings.slice(i, i + 100) }, "Points ledger discrepancies");
        }
      } else {
        logger.info({ code: "POINTS_RECONCILIATION_OK", checkedAt: report.checkedAt,
          counts: report.counts }, "Points ledger reconciled");
      }
    } catch {
      // Database errors can contain connection details or financial free text; never log the error.
      logger.error({ code: "POINTS_RECONCILIATION_FAILED" }, "Points check unavailable; operator review required");
    } finally { running = false; }
  }
  const timer = setInterval(() => { void check(); }, intervalMs);
  timer.unref();
  void check();
  return { check, stop: () => { stopped = true; clearInterval(timer); } };
}
