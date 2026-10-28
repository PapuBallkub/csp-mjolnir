import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  adminAddPipelineRecord,
  adminDismissPipelineFailure,
  adminGetPipelineRecord,
  adminGetPipelineTasks,
  adminOperations,
  adminRetryAllPipelineFailures,
  adminRetryPipelineStep,
  adminSkipPipelineStep,
} from "../app/_lib/api.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; init: RequestInit };

function stubFetch(response: Response | (() => never)): Call[] {
  const calls: Call[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (typeof response === "function") response();
    return response;
  }) as typeof fetch;

  return calls;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("adminRetryPipelineStep posts to /api/admin/pipeline/retry with projectId and step", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      projectId: "68049205582",
      step: "ocr",
      status: "re-queued",
      message: "Failure cleared and project 68049205582 re-queued for ocr",
    }),
  );

  const result = await adminRetryPipelineStep("68049205582", "ocr");

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.status, "re-queued");
  assert.equal(result.data.step, "ocr");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/retry");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body,
    JSON.stringify({ projectId: "68049205582", step: "ocr" }),
  );
  assert.equal(calls[0].init.credentials, "include");
});

test("adminRetryPipelineStep handles 409 run lock collision gracefully", async () => {
  stubFetch(
    json(409, {
      error: {
        message:
          "Pipeline is currently executing another job. Step failure was cleared and re-queued for the next cycle.",
      },
    }),
  );

  const result = await adminRetryPipelineStep("68049205582", "ocr");

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.status, 409);
  assert.match(result.error.message, /Pipeline is currently executing another job/);
});

test("adminDismissPipelineFailure posts to /api/admin/pipeline/dismiss with reason", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      projectId: "68049205582",
      step: "ocr",
      status: "dismissed",
      message: "Failure for project 68049205582 on step ocr dismissed",
    }),
  );

  const result = await adminDismissPipelineFailure(
    "68049205582",
    "ocr",
    "Unreadable scanned document",
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.status, "dismissed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/dismiss");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body,
    JSON.stringify({
      projectId: "68049205582",
      step: "ocr",
      reason: "Unreadable scanned document",
    }),
  );
});

test("adminOperations receives and deserializes pipeline failures, stages, and runs", async () => {
  stubFetch(
    json(200, {
      sources: [],
      stats: {
        docsIngestedToday: 10,
        docsAwaitingReview: 2,
        avgOcrConfidence: 0.95,
        avgExtractionConfidence: 0.9,
        amendmentsDetected7d: 1,
      },
      reviewQueue: [],
      pipelineFailures: [
        {
          projectId: "68049205582",
          projectTitle: "ระบบคลาวด์กลาง",
          agency: "กรมการจัดหางาน",
          step: "ocr",
          attempts: 2,
          lastError: "OCR timeout exceeded",
          lastTransient: false,
          firstFailedAt: "2026-10-14 06:12:00",
          lastFailedAt: "2026-10-14 07:15:22",
        },
      ],
      stageSnapshot: {
        stages: { fetched: 12, downloaded: 8, ocr_done: 20 },
        screens: { pass: 20, not_it: 5 },
        insights: { extracted: 18, excluded: 2 },
      },
      pipelineRuns: [
        {
          id: "run-01",
          job: "poll",
          outcome: "done",
          startedAt: "2026-10-14 08:00:00",
          durationMs: 45000,
          steps: [{ name: "ingest fetch", exitCode: 0, startedAt: "2026-10-14 08:00:00", ms: 5000 }],
          error: null,
        },
      ],
    }),
  );

  const res = await adminOperations();
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.data.pipelineFailures?.length, 1);
  assert.equal(res.data.pipelineFailures?.[0].projectId, "68049205582");
  assert.equal(res.data.pipelineFailures?.[0].step, "ocr");
  assert.equal(res.data.stageSnapshot?.stages?.ocr_done, 20);
  assert.equal(res.data.pipelineRuns?.length, 1);
  assert.equal(res.data.pipelineRuns?.[0].job, "poll");
});

test("adminGetPipelineRecord queries /api/admin/pipeline/record/:projectId", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      record: {
        projectId: "69099683466",
        title: "โครงการระบบคอมพิวเตอร์",
        agency: "กรุงเทพมหานคร",
        budgetTHB: 10_000_000,
        referencePriceTHB: 9_800_000,
        submissionDeadline: null,
        status: "Open",
        isAmended: false,
        pipelineStatus: "downloaded",
        source: "process3",
        announceDate: "2026-10-18",
        stages: {
          fetched: { done: true },
          downloaded: { done: true },
          ocr: { done: false },
          extracted: { done: false },
          reviewed: { done: false },
        },
      },
    }),
  );

  const res = await adminGetPipelineRecord("69099683466");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.data.record.projectId, "69099683466");
  assert.equal(res.data.record.pipelineStatus, "downloaded");
  assert.equal(res.data.record.stages.downloaded.done, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/record/69099683466");
  assert.equal(calls[0].init.credentials, "include");
});

test("adminAddPipelineRecord posts to /api/admin/pipeline/add with projectId", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      projectId: "69099683466",
      title: "โครงการติดตั้งระบบเครือข่าย",
      agency: "สำนักการแพทย์",
      status: "Open",
      pipelineStatus: "downloaded",
      message: "Project 69099683466 successfully added and package downloaded.",
    }),
  );

  const res = await adminAddPipelineRecord("69099683466");
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.data.projectId, "69099683466");
  assert.equal(res.data.pipelineStatus, "downloaded");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/add");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, JSON.stringify({ projectId: "69099683466" }));
});

test("adminAddPipelineRecord handles 409 conflict when duplicate project", async () => {
  stubFetch(
    json(409, {
      error: {
        message: "Project 69099683466 already exists in the database",
      },
    }),
  );

  const res = await adminAddPipelineRecord("69099683466");
  assert.equal(res.ok, false);
  if (res.ok) return;

  assert.equal(res.error.status, 409);
  assert.match(res.error.message, /already exists/);
});

test("adminRetryPipelineStep posts runNow: true when requested", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      projectId: "68049205582",
      step: "extract",
      status: "executed",
      executedImmediately: true,
      message: "Step extract executed immediately for project 68049205582",
    }),
  );

  const result = await adminRetryPipelineStep("68049205582", "extract", true);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.status, "executed");
  assert.equal(result.data.executedImmediately, true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/retry");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body,
    JSON.stringify({ projectId: "68049205582", step: "extract", runNow: true }),
  );
});

test("adminRetryAllPipelineFailures posts options to /api/admin/pipeline/retry-all", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      clearedCount: 5,
      message: "Cleared and re-queued 5 failure(s)",
    }),
  );

  const result = await adminRetryAllPipelineFailures({ transientOnly: true, step: "ocr" });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.clearedCount, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/retry-all");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body,
    JSON.stringify({ transientOnly: true, step: "ocr" }),
  );
});

test("adminGetPipelineTasks queries /api/admin/pipeline/tasks with phase and search filters", async () => {
  const mockResult = {
    tasks: [
      {
        projectId: "68049205582",
        title: "Test Project",
        agency: "กรมทางหลวง",
        pipelineStatus: "ocr_preview",
        phase: "ocr",
        step: "ocr",
        lastError: null,
        attempts: 1,
        lastTransient: false,
        updatedAt: "2026-04-12T10:00:00.000Z",
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    counts: {
      all: 10,
      download: 2,
      ocr: 1,
      extract: 3,
      extracted: 3,
      failed: 1,
    },
  };

  const calls = stubFetch(json(200, mockResult));

  const result = await adminGetPipelineTasks({ phase: "ocr", search: "680492", page: 1, limit: 20 });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.tasks.length, 1);
  assert.equal(result.data.counts.ocr, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/tasks?phase=ocr&search=680492&page=1&limit=20");
});

test("adminSkipPipelineStep posts to /api/admin/pipeline/skip with projectId and step", async () => {
  const calls = stubFetch(
    json(200, {
      ok: true,
      projectId: "68049205582",
      step: "ocr",
      nextStatus: "ocr_done",
      message: "Project 68049205582 advanced past ocr step",
    }),
  );

  const result = await adminSkipPipelineStep("68049205582", "ocr");

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.nextStatus, "ocr_done");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/pipeline/skip");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.body,
    JSON.stringify({ projectId: "68049205582", step: "ocr" }),
  );
});



