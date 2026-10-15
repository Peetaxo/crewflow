// Test infrastructure only. A client abort/timeout does not prove the Edge worker stopped.
export class InvoiceTestInterrupted extends Error {
  constructor(reason) {
    super(`invoice_test_interrupted: ${reason}`);
  }
}
export const definitiveWorkerResponse = (status, body) =>
  (status === 200 && Number.isInteger(body?.processed) && body.processed >= 0 &&
    body.processed <= 4 && Number.isInteger(body?.rendered) &&
    body.rendered >= 0 && body.rendered <= 1) ||
  (status === 401 && body?.error === "unauthorized") ||
  (status === 405 && body?.error === "method_not_allowed");
export const createInvoiceTestLifecycle = (deps) => {
  let stopReason = null;
  let cleanupPromise;
  let rejectStop;
  const stopped = new Promise((_resolve, reject) => {
    rejectStop = reject;
  });
  stopped.catch(() => {});
  const pending = new Set();
  const workers = [];
  const check = () => {
    if (stopReason) throw new InvoiceTestInterrupted(stopReason);
  };
  const lifecycle = {
    check,
    stop(reason = "completed") {
      if (!stopReason) {
        stopReason = reason;
        rejectStop(new InvoiceTestInterrupted(reason));
      }
    },
    get interrupted() {
      return stopReason !== null && stopReason !== "completed";
    },
    async fetch(input, init) {
      check();
      const url = typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
      const isWorker =
        new URL(url).pathname === "/functions/v1/process-invoice-pdfs";
      const record = isWorker
        ? {
          id: workers.length + 1,
          startedAt: new Date().toISOString(),
          definitive: false,
        }
        : null;
      if (record) workers.push(record);
      const operation = (async () => {
        try {
          const response = await deps.fetch(input, init);
          const completedBody = await response.clone().text();
          if (record) {
            const body = JSON.parse(completedBody);
            Object.assign(record, {
              status: response.status,
              definitive: definitiveWorkerResponse(response.status, body),
              completedAt: new Date().toISOString(),
            });
          }
          return response;
        } catch (error) {
          if (record) record.ambiguous = true;
          throw error;
        }
      })();
      pending.add(operation);
      operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      const response = await Promise.race([operation, stopped]);
      check();
      return response;
    },
    cleanup() {
      lifecycle.stop("completed");
      return cleanupPromise ??= (async () => {
        let restorationAttempted = false;
        try {
          await deps.stopSchedule();
          await deps.record({ stage: "stopped", reason: stopReason });
          await Promise.allSettled([...pending]);
          if (workers.some((record) => !record.definitive)) {
            throw new Error("worker_quiescence_unconfirmed");
          }
          const cron = await deps.drainCron();
          const proof = {
            quiescenceConfirmed: true,
            stopped: true,
            reason: stopReason,
            completedAt: new Date().toISOString(),
            directWorkers: workers,
            cron,
          };
          await deps.record({ stage: "drained", ...proof });
          restorationAttempted = true;
          const restored = await deps.restore(proof);
          const result = { ...proof, restored, drained: true };
          await deps.record({ stage: "restored", ...result });
          return result;
        } catch (error) {
          await deps.record({
            stage: "blocked",
            reason: stopReason,
            directWorkers: workers,
            timersRetained: !restorationAttempted,
            restorationAttempted,
            cronOutstanding: error.outstandingRequests ?? null,
            error: "worker_quiescence_or_restore_unconfirmed",
          });
          throw error;
        }
      })();
    },
  };
  return lifecycle;
};
