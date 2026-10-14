import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  adminDismissPipelineFailure,
  adminOperations,
  adminRetryPipelineStep,
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
