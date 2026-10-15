export const isWorkerAuthorized = (
  authorization: string | null,
  secret: string,
): boolean => {
  if (!secret || !authorization) return false;
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
};
export type Job = { id: string; lease_token: string };
export type RenderJob = {
  status: "render";
  invoice: Record<string, unknown>;
  items: Record<string, unknown>[];
  pdf_path: string;
};
export interface JobDependencies {
  claim(): Promise<Job | null>;
  process(job: Job): Promise<{ status: string } | RenderJob>;
  render(job: RenderJob): Promise<Uint8Array>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  complete(
    job: Job,
    path: string | null,
    error: string | null,
  ): Promise<unknown>;
}
export const runInvoicePdfJobs = async (deps: JobDependencies) => {
  let processed = 0;
  let rendered = 0;
  for (let iteration = 0; iteration < 4; iteration++) {
    const job = await deps.claim();
    if (!job) break;
    let result: Awaited<ReturnType<JobDependencies["process"]>>;
    try {
      result = await deps.process(job);
    } catch {
      await deps.complete(job, null, "job_process_failed");
      break;
    }
    processed++;
    if (result.status !== "render") continue;
    const render = result as RenderJob;
    try {
      const bytes = await deps.render(render);
      await deps.upload(render.pdf_path, bytes);
    } catch {
      await deps.complete(job, null, "pdf_render_or_upload_failed");
      break;
    }
    // Keep completion outside the rendering catch. A lost successful callback must not become a failure callback.
    await deps.complete(job, render.pdf_path, null);
    rendered++;
    break;
  }
  return { processed, rendered };
};
