"use client";

import { useState } from "react";
import {
  pipelineStats,
  reviewQueue,
  scraperSources,
  type SourceHealth,
} from "../../_data/ops";
import { useLang } from "../../_components/prefs";
import { btn, input, Label, Panel, SectionHeading } from "../../_components/ui";

/**
 * Operational surface, not a marketing one: dense tables, real failure text,
 * and the correction controls sitting next to the thing they correct. The
 * numeric OCR/LLM confidence lives here and only here (§5).
 */

const HEALTH: Record<SourceHealth, { chip: string; label: { th: string; en: string } }> = {
  ok: {
    chip: "border-open-line bg-open-bg text-open",
    label: { th: "ปกติ", en: "Healthy" },
  },
  degraded: {
    chip: "border-amend-line bg-amend-bg text-amend",
    label: { th: "ไม่เสถียร", en: "Degraded" },
  },
  failed: {
    chip: "border-risk-line bg-risk-bg text-risk",
    label: { th: "ล้มเหลว", en: "Failing" },
  },
};

function confidenceTone(value: number): string {
  if (value < 0.7) return "bg-risk";
  if (value < 0.85) return "bg-amend";
  return "bg-open";
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="relative h-[4px] w-16 overflow-hidden rounded-full bg-line">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${confidenceTone(value)}`}
          style={{ width: `${value * 100}%` }}
        />
      </span>
      <span className="font-mono tnum text-[14px] text-ink">{Math.round(value * 100)}%</span>
    </span>
  );
}

export default function AdminPage() {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState<string | null>(reviewQueue[0]?.docId ?? null);
  const [handled, setHandled] = useState<Record<string, string>>({});

  const pending = reviewQueue.filter((item) => !handled[item.docId]);

  const stats = [
    {
      value: pipelineStats.docsIngestedToday,
      label: { th: "เอกสารเข้าวันนี้", en: "Ingested today" },
    },
    {
      value: pending.length,
      label: { th: "รอตรวจทาน", en: "Awaiting review" },
    },
    {
      value: `${Math.round(pipelineStats.avgOcrConfidence * 100)}%`,
      label: { th: "ความมั่นใจ OCR เฉลี่ย", en: "Avg OCR confidence" },
    },
    {
      value: `${Math.round(pipelineStats.avgExtractionConfidence * 100)}%`,
      label: { th: "ความมั่นใจการสกัดข้อมูล", en: "Avg extraction confidence" },
    },
    {
      value: pipelineStats.amendmentsDetected7d,
      label: { th: "พบการแก้ไข 7 วัน", en: "Amendments, 7 days" },
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          {lang === "th" ? "สำหรับผู้ดูแลระบบ" : "Platform admin"}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "สุขภาพระบบเก็บข้อมูล" : "Pipeline health"}
        </h1>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Panel key={stat.label.en} className="px-3 py-2.5">
            <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[13px] leading-thai text-ink-2">{stat.label[lang]}</p>
          </Panel>
        ))}
      </div>

      <section className="mb-8">
        <SectionHeading
          right={
            <span className="font-mono text-[13px]">
              {lang === "th" ? "รอบล่าสุด 12 ส.ค. 06:33" : "Last run 12 Aug 06:33"}
            </span>
          }
        >
          {lang === "th" ? "ตัวเก็บข้อมูลรายแหล่ง" : "Scrapers by source"}
        </SectionHeading>

        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: lang === "th" ? "แหล่งข้อมูล" : "Source", right: false },
                  { text: lang === "th" ? "สถานะ" : "Health", right: false },
                  { text: lang === "th" ? "14 วันล่าสุด" : "Last 14 runs", right: false },
                  { text: lang === "th" ? "ความพร้อมใช้" : "Uptime", right: true },
                  { text: lang === "th" ? "เอกสาร 7 วัน" : "Docs 7d", right: true },
                  { text: lang === "th" ? "รอบล่าสุด" : "Last run", right: true },
                ].map((column) => (
                  <th
                    key={column.text}
                    className={`px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
                      column.right ? "text-right" : ""
                    }`}
                  >
                    {column.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scraperSources.map((source) => (
                <tr
                  key={source.id}
                  className="border-b border-line align-top last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <span className="block text-[14px] leading-thai text-ink">{source.name}</span>
                    <span className="mt-0.5 block font-mono text-[13px] text-ink-3">
                      {source.portal} · {source.format}
                    </span>
                    {source.error ? (
                      <p className="mt-1.5 max-w-[420px] rounded-[3px] border border-line bg-surface-2 px-2 py-1.5 font-mono text-[13px] leading-relaxed text-ink-2">
                        {source.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-[2px] border px-2 py-[3px] text-[12px] font-medium ${HEALTH[source.health].chip}`}
                    >
                      {HEALTH[source.health].label[lang]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-end gap-[2px]" aria-hidden="true">
                      {source.history.map((succeeded, index) => (
                        <span
                          key={index}
                          className={`w-[4px] rounded-[1px] ${
                            succeeded ? "h-[12px] bg-open" : "h-[16px] bg-risk"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="sr-only">
                      {source.history.filter(Boolean).length}/14 runs succeeded
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[14px] text-ink">
                    {source.uptime.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[14px] text-ink-2">
                    {source.docsLast7Days}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[13px] text-ink-3">
                    {source.lastRun}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <section>
        <SectionHeading
          right={
            <span className="font-mono text-[13px]">
              {pending.length} {lang === "th" ? "รอดำเนินการ" : "pending"}
            </span>
          }
        >
          {lang === "th" ? "คิวตรวจทานผลการอ่านเอกสาร" : "Extraction review queue"}
        </SectionHeading>

        <div className="flex flex-col gap-2">
          {reviewQueue.map((item) => {
            const open = expanded === item.docId;
            const resolution = handled[item.docId];

            return (
              <Panel key={item.docId} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : item.docId)}
                  className="flex w-full flex-col gap-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4"
                  aria-expanded={open}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono tnum text-[13px] text-ink-3">{item.docId}</span>
                      {item.misclassified ? (
                        <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-[3px] text-[12px] font-medium text-risk">
                          {lang === "th" ? "อาจจัดประเภทผิด" : "Likely misclassified"}
                        </span>
                      ) : null}
                      {resolution ? (
                        <span className="rounded-[2px] border border-open-line bg-open-bg px-2 py-[3px] text-[12px] font-medium text-open">
                          {resolution}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[14px] leading-thai text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-3">
                      {item.agency} · {item.ingestedAt}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col gap-1.5">
                    <ConfidenceBar value={item.ocr} label="OCR" />
                    <ConfidenceBar value={item.extraction} label="LLM" />
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-line bg-surface-2 px-3.5 py-3">
                    {item.misclassified ? (
                      <div className="mb-3 flex flex-col gap-2 rounded-[3px] border border-line bg-surface p-3">
                        <Label>{lang === "th" ? "การจัดประเภท" : "Classification"}</Label>
                        <p className="text-[14px] leading-thai text-ink-2">
                          {lang === "th"
                            ? `ระบบจัดเป็น “${item.misclassified.predicted}” แต่เนื้อหาน่าจะเป็น “${item.misclassified.likely}”`
                            : `Classified as “${item.misclassified.predicted}”, but the content reads as “${item.misclassified.likely}”.`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setHandled({
                                ...handled,
                                [item.docId]:
                                  lang === "th" ? "จัดประเภทใหม่แล้ว" : "Reclassified",
                              })
                            }
                            className={btn.primary}
                          >
                            {lang === "th"
                              ? "จัดประเภทใหม่เป็นงานนอกขอบเขต"
                              : "Reclassify as out of scope"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHandled({
                                ...handled,
                                [item.docId]: lang === "th" ? "ยืนยันแล้ว" : "Confirmed",
                              })
                            }
                            className={btn.secondary}
                          >
                            {lang === "th" ? "ยืนยันว่าถูกต้องแล้ว" : "Classification is correct"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {item.lowFields.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        <Label>
                          {lang === "th"
                            ? "ฟิลด์ที่ความมั่นใจต่ำ — แก้ไขได้ที่นี่"
                            : "Low-confidence fields — correct them here"}
                        </Label>
                        {item.lowFields.map((field) => (
                          <div
                            key={field.field}
                            className="flex flex-col gap-1.5 rounded-[3px] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:gap-3"
                          >
                            <span className="min-w-[200px] text-[14px] leading-thai text-ink-2">
                              {field.field}
                            </span>
                            <input
                              defaultValue={field.value}
                              className={`${input} font-mono flex-1`}
                              aria-label={field.field}
                            />
                            <span className="font-mono tnum text-[13px] text-ink-3">
                              {Math.round(field.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setHandled({
                                ...handled,
                                [item.docId]: lang === "th" ? "ตรวจทานแล้ว" : "Reviewed",
                              })
                            }
                            className={btn.primary}
                          >
                            {lang === "th" ? "บันทึกและปล่อยให้ผู้ใช้เห็น" : "Save and publish"}
                          </button>
                          <a
                            href="https://process3.gprocurement.go.th/"
                            target="_blank"
                            rel="noreferrer"
                            className={btn.secondary}
                          >
                            {lang === "th" ? "เปิดไฟล์ต้นฉบับเทียบ" : "Open the source file"}
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setHandled({
                                ...handled,
                                [item.docId]: lang === "th" ? "ส่งอ่านใหม่แล้ว" : "Re-queued",
                              })
                            }
                            className={btn.ghost}
                          >
                            {lang === "th" ? "สั่งให้อ่านเอกสารใหม่" : "Re-run extraction"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      </section>
    </div>
  );
}
