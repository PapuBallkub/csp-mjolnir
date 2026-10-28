import type { PipelineRunItem } from "../../../_lib/api";
import { Panel, SectionHeading } from "../../../_components/ui";

export function PipelineRunsSection({
  runs,
  lang,
}: {
  runs?: PipelineRunItem[];
  lang: "th" | "en";
}) {
  if (!runs || runs.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading
        right={
          <span className="text-[11px] text-ink-3">
            {runs.length} {lang === "th" ? "รอบล่าสุด" : "recent runs"}
          </span>
        }
        sub={
          lang === "th"
            ? "บันทึกการทำงานของคำสั่งอัตโนมัติ (poll, sweep, process) พร้อมสถานะของแต่ละขั้นตอน"
            : "Execution telemetry for cron & scheduled pipeline jobs with step breakdown."
        }
      >
        {lang === "th" ? "ประวัติการรัน Job อัตโนมัติ" : "Scheduled job execution history"}
      </SectionHeading>

      <Panel className="overflow-x-auto shadow-xs">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {[
                { text: lang === "th" ? "เวลาเริ่มต้น" : "Timestamp", right: false },
                { text: lang === "th" ? "งาน (Job)" : "Job", right: false },
                { text: lang === "th" ? "ผลลัพธ์" : "Outcome", right: false },
                { text: lang === "th" ? "เวลาที่ใช้" : "Duration", right: true },
                { text: lang === "th" ? "ขั้นตอนย่อย" : "Steps", right: false },
              ].map((col) => (
                <th
                  key={col.text}
                  className={`px-3 py-2 text-[11px] font-medium text-ink-3 ${
                    col.right ? "text-right" : ""
                  }`}
                >
                  {col.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <PipelineRunRow key={run.id} run={run} lang={lang} />
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

export function PipelineRunRow({
  run,
  lang,
}: {
  run: PipelineRunItem;
  lang: "th" | "en";
}) {
  return (
    <tr className="border-b border-line align-middle last:border-b-0 hover:bg-surface-2/40">
      <td className="px-3 py-2 font-mono tnum text-[11px] text-ink-2 whitespace-nowrap">
        {run.startedAt}
      </td>
      <td className="px-3 py-2">
        <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] text-[10px] text-ink font-semibold uppercase">
          {run.job}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-[2px] border px-1.5 py-[2px] text-[10px] uppercase font-medium ${
            run.outcome === "done"
              ? "border-open-line bg-open-bg text-open"
              : run.outcome === "timed-out"
                ? "border-amend-line bg-amend-bg text-amend"
                : run.outcome === "failed"
                  ? "border-risk-line bg-risk-bg text-risk"
                  : "border-line bg-surface-2 text-ink-2"
          }`}
        >
          {run.outcome}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tnum text-[11px] text-ink-2">
        {run.durationMs > 1000
          ? `${(run.durationMs / 1000).toFixed(1)}s`
          : `${run.durationMs}ms`}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {run.steps && run.steps.length > 0 ? (
            run.steps.map((step, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-[1px] text-[10px] ${
                  step.exitCode === 0
                    ? "border-line bg-surface text-ink-2"
                    : step.exitCode === null
                      ? "border-line/60 bg-surface-2 text-ink-3"
                      : "border-risk-line bg-risk-bg text-risk"
                }`}
                title={`${step.name}: exit code ${step.exitCode ?? "none"}, ${step.ms}ms`}
              >
                <span>{step.name}</span>
                <span className="text-[9px]">
                  {step.exitCode === 0 ? "✓" : step.exitCode === null ? "—" : "✗"}
                </span>
              </span>
            ))
          ) : (
            <span className="text-[11px] text-ink-3 italic">
              {lang === "th" ? "ไม่มีขั้นตอนย่อย" : "No step details"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
