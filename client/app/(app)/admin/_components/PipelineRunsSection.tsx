import type { PipelineRunItem } from "../../../_lib/api";
import { Panel, SectionHeading } from "../../../_components/ui";

export function PipelineRunsSection({
  runs,
}: {
  runs?: PipelineRunItem[];
}) {
  if (!runs || runs.length === 0) return null;

  return (
    <section className="mb-8 w-full">
      <SectionHeading
        right={
          <span className="text-[11px] text-ink-3">
            {runs.length} รอบล่าสุด
          </span>
        }
        sub="บันทึกการทำงานของคำสั่งอัตโนมัติ (poll, sweep, process) พร้อมสถานะของแต่ละขั้นตอน"
      >
        ประวัติการรัน Job อัตโนมัติ
      </SectionHeading>

      <Panel className="w-full overflow-x-auto shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {[
                { text: "เวลาเริ่มต้น", right: false },
                { text: "งาน (Job)", right: false },
                { text: "ผลลัพธ์", right: false },
                { text: "เวลาที่ใช้", right: true },
                { text: "ขั้นตอนย่อย", right: false },
              ].map((col) => (
                <th
                  key={col.text}
                  className={`px-3.5 py-2.5 text-[11px] font-medium text-ink-3 ${
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
              <PipelineRunRow key={run.id} run={run} />
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

export function PipelineRunRow({
  run,
}: {
  run: PipelineRunItem;
}) {
  return (
    <tr className="border-b border-line align-middle last:border-b-0 hover:bg-surface-2/40">
      <td className="px-3.5 py-2.5 font-mono tnum text-[12px] text-ink-2 whitespace-nowrap">
        {run.startedAt}
      </td>
      <td className="px-3.5 py-2.5">
        <span className="rounded-[2px] border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink font-semibold uppercase">
          {run.job}
        </span>
      </td>
      <td className="px-3.5 py-2.5">
        <span
          className={`inline-flex rounded-[2px] border px-2 py-0.5 text-[11px] uppercase font-medium ${
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
      <td className="px-3.5 py-2.5 text-right font-mono tnum text-[12px] text-ink-2">
        {run.durationMs > 1000
          ? `${(run.durationMs / 1000).toFixed(1)}s`
          : `${run.durationMs}ms`}
      </td>
      <td className="px-3.5 py-2.5">
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
              ไม่มีขั้นตอนย่อย
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
