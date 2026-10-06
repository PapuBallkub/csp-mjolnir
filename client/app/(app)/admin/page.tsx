"use client";

import { useEffect, useState } from "react";
import {
  adminOperations,
  adminReExtract,
  adminTriggerIngest,
  adminUpdateReview,
  type AdminOperations,
  type ApiError,
  type ReviewItem,
  type SourceHealth,
  type UpdateReviewPayload,
} from "../../_lib/api";
import { useLang } from "../../_components/prefs";
import { SignInPrompt } from "../../_components/sign-in-prompt";
import { btn, EmptyState, input, Label, Panel, SectionHeading } from "../../_components/ui";

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
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="relative h-[4px] w-16 overflow-hidden rounded-full bg-line">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${confidenceTone(value)}`}
          style={{ width: `${value * 100}%` }}
        />
      </span>
      <span className="font-mono tnum text-[12px] text-ink">{Math.round(value * 100)}%</span>
    </span>
  );
}

/**
 * Loads the dashboard, and is the only thing on this route that runs for a
 * non-admin.
 *
 * The data is not in the bundle. It arrives from /api/admin/operations behind
 * requireRole('admin'), so a guest gets 401 and an ordinary user gets 403,
 * each with nothing attached. That is the actual protection — this component
 * only decides what to say about it. Hiding the nav link never protected
 * anything, because a JavaScript chunk cannot be hidden from the browser it
 * was sent to. See 0011.
 */
export default function AdminPage() {
  const { lang } = useLang();
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadOperations = async () => {
    setIsRefreshing(true);
    const result = await adminOperations();
    setIsRefreshing(false);
    if (result.ok) {
      setOps(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    adminOperations().then((result) => {
      if (cancelled) return;
      if (result.ok) setOps(result.data);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error?.status === 401) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <SignInPrompt
          next="/admin"
          headline={lang === "th" ? "ส่วนนี้สำหรับผู้ดูแลระบบ" : "This area is for administrators"}
          body={
            lang === "th"
              ? "เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูสถานะ scraper และคิวตรวจทาน"
              : "Sign in with an administrator account to see scraper health and the review queue."
          }
          cta={lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <EmptyState
          headline={
            error.status === 403
              ? lang === "th"
                ? "บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้"
                : "Your account does not have access to this area"
              : lang === "th"
                ? "โหลดข้อมูลไม่สำเร็จ"
                : "Could not load the dashboard"
          }
          body={
            error.status === 403
              ? lang === "th"
                ? "ส่วนนี้จำกัดเฉพาะผู้ดูแลระบบ หากคุณควรมีสิทธิ์ ให้ติดต่อคนในทีมเพื่อกำหนดบทบาทให้"
                : "Administrator accounts only. If you should have access, ask a teammate to grant it."
              : error.message
          }
        />
      </div>
    );
  }

  if (!ops) {
    return <div className="mx-auto min-h-[60vh] max-w-[1240px] px-4 py-10" aria-busy="true" />;
  }

  return (
    <AdminDashboard
      ops={ops}
      lang={lang}
      onRefresh={loadOperations}
      isRefreshing={isRefreshing}
    />
  );
}

function AdminDashboard({
  ops,
  lang,
  onRefresh,
  isRefreshing,
}: {
  ops: AdminOperations;
  lang: "th" | "en";
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { sources: scraperSources, reviewQueue, stats: pipelineStats, recentLogs } = ops;
  const [expanded, setExpanded] = useState<string | null>(reviewQueue[0]?.docId ?? null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [isPolling, setIsPolling] = useState(false);
  const [pollingSource, setPollingSource] = useState<string | null>(null);
  const [pollMessage, setPollMessage] = useState<string | null>(null);

  // Review Queue Search & Filters
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "misclassified" | "reviewed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const pendingCount = reviewQueue.filter(
    (item) => !handled[item.docId] && item.reviewStatus !== "approved",
  ).length;
  const misclassifiedCount = reviewQueue.filter((item) => item.misclassified).length;

  const filteredQueue = reviewQueue.filter((item) => {
    const isHandled = Boolean(handled[item.docId]) || item.reviewStatus === "approved";
    if (filterTab === "pending" && isHandled) return false;
    if (filterTab === "misclassified" && !item.misclassified) return false;
    if (filterTab === "reviewed" && !isHandled) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = item.docId.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchAgency = item.agency.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchAgency) return false;
    }
    return true;
  });

  const inMaintenance = (() => {
    const bangkokHour = (new Date().getUTCHours() + 7) % 24;
    return bangkokHour >= 0 && bangkokHour < 4;
  })();

  const handleTriggerPoll = async (sourceId: string = "all") => {
    setIsPolling(true);
    setPollingSource(sourceId);
    setPollMessage(null);
    const res = await adminTriggerIngest(sourceId);
    setIsPolling(false);
    setPollingSource(null);
    if (res.ok) {
      const maintenanceNote = inMaintenance
        ? lang === "th"
          ? " (หมายเหตุ: ขณะนี้อยู่ในช่วงปิดปรับปรุง e-GP 00:00–04:00 น. อาจไม่พบประกาศใหม่)"
          : " (Note: e-GP is currently in nightly maintenance 00:00–04:00)"
        : "";
      setPollMessage(
        (lang === "th"
          ? `ดึงข้อมูลสำเร็จ: ค้นพบ/อัปเดต ${res.data.fetched} ประกาศใหม่ (${sourceId === "all" ? "ทุกแหล่ง" : sourceId})`
          : `Ingestion poll complete: discovered ${res.data.fetched} notice(s) for ${sourceId}`) +
          maintenanceNote,
      );
      onRefresh();
    } else {
      setPollMessage(res.error.message);
    }
  };

  const stats = [
    {
      value: pipelineStats.totalIndexedTors ?? 29,
      label: { th: "เอกสารทั้งหมดในระบบ", en: "Total in catalog" },
    },
    {
      value: pipelineStats.docsIngestedToday,
      label: { th: "เอกสารเข้าวันนี้", en: "Ingested today" },
    },
    {
      value: pendingCount,
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
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {lang === "th" ? "สำหรับผู้ดูแลระบบ" : "Platform admin"}
          </p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
            {lang === "th" ? "สุขภาพระบบเก็บข้อมูลและการตรวจสอบข้อมูล" : "Pipeline Health & Data Integrity"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || isPolling}
            className={btn.secondary}
            aria-label={lang === "th" ? "รีเฟรชข้อมูล" : "Refresh data"}
          >
            {isRefreshing ? (
              <span className="animate-spin inline-block">↻</span>
            ) : (
              "↻"
            )}{" "}
            {lang === "th" ? "รีเฟรชสถานะ" : "Refresh status"}
          </button>
        </div>
      </header>

      {/* KPI Stats Strip */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Panel key={stat.label.en} className="px-3 py-2.5">
            <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11px] leading-thai text-ink-3">{stat.label[lang]}</p>
          </Panel>
        ))}
      </div>

      {/* Scrapers by Source */}
      <section className="mb-8">
        <SectionHeading
          right={
            <div className="flex items-center gap-3">
              {inMaintenance ? (
                <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-1 font-mono text-[11px] font-medium text-amend">
                  {lang === "th" ? "⚠️ ปิดปรับปรุง 00:00–04:00" : "⚠️ Maintenance 00:00–04:00"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => handleTriggerPoll("all")}
                disabled={isPolling || isRefreshing}
                className={btn.primary}
              >
                {isPolling && pollingSource === "all" ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : null}
                {lang === "th" ? "สั่งดึงข้อมูลทุกแหล่งเดี๋ยวนี้" : "Poll All Sources Now"}
              </button>
            </div>
          }
        >
          {lang === "th" ? "ตัวเก็บข้อมูลรายแหล่ง" : "Scrapers by source"}
        </SectionHeading>

        {/* Maintenance Window Information Notice (Option A) */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-line bg-surface-2 px-3 py-2 text-[12px] leading-thai text-ink-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-ink-3">ℹ️</span>
            <span>
              {lang === "th"
                ? "ระบบ e-GP ของกรมบัญชีกลางปิดปรับปรุงประจำวันช่วง 00:00 – 04:00 น. การดึงข้อมูลอัตโนมัติหรือการเชื่อมต่อในช่วงเวลานี้จะหยุดพักและทำงานต่อหลัง 04:00 น."
                : "e-GP portals undergo scheduled maintenance daily between 00:00 – 04:00. Automated scraping and external document queries pause during this window."}
            </span>
          </div>
          {inMaintenance ? (
            <span className="shrink-0 font-mono text-[11px] font-medium text-amend">
              {lang === "th" ? "[ กำลังอยู่ในช่วงปิดปรับปรุง ]" : "[ Active Maintenance Window ]"}
            </span>
          ) : null}
        </div>

        {pollMessage ? (
          <div className="mb-3 rounded-[3px] border border-open-line bg-open-bg px-3 py-2 font-mono text-[12px] text-open">
            {pollMessage}
          </div>
        ) : null}

        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: lang === "th" ? "แหล่งข้อมูล" : "Source", right: false },
                  { text: lang === "th" ? "สถานะ" : "Health", right: false },
                  { text: lang === "th" ? "14 วันล่าสุด" : "Last 14 runs", right: false },
                  { text: lang === "th" ? "ความพร้อมใช้" : "Uptime", right: true },
                  { text: lang === "th" ? "เอกสารในระบบ" : "Docs in system", right: true },
                  { text: lang === "th" ? "รอบล่าสุด" : "Last run", right: true },
                  { text: lang === "th" ? "คำสั่ง" : "Action", right: true },
                ].map((column) => (
                  <th
                    key={column.text}
                    className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
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
                    <span className="block text-[13px] leading-thai text-ink font-medium">
                      {source.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                      {source.portal} · {source.format}
                    </span>
                    {source.error ? (
                      <p className="mt-1.5 max-w-[420px] rounded-[3px] border border-risk-line bg-risk-bg px-2 py-1.5 font-mono text-[11px] leading-relaxed text-risk">
                        {source.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-[2px] border px-1.5 py-[3px] text-[11px] font-medium ${
                        HEALTH[source.health]?.chip ?? "border-line bg-surface-2 text-ink-2"
                      }`}
                    >
                      {HEALTH[source.health]?.label[lang] ?? source.health}
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
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink">
                    {source.uptime.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink-2">
                    {source.docsLast7Days}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[11px] text-ink-3">
                    {source.lastRun}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleTriggerPoll(source.id)}
                      disabled={isPolling || isRefreshing}
                      className={`${btn.secondary} font-mono text-[11px] py-1 px-2.5`}
                    >
                      {isPolling && pollingSource === source.id ? (
                        <span className="animate-spin inline-block mr-1">↻</span>
                      ) : null}
                      {lang === "th" ? "ดึงแหล่งนี้" : "Poll"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* Recent Ingestion Execution Activity */}
      {recentLogs && recentLogs.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            right={
              <span className="font-mono text-[11px] text-ink-3">
                {recentLogs.length} {lang === "th" ? "รอบล่าสุด" : "recent runs"}
              </span>
            }
          >
            {lang === "th" ? "ประวัติการดึงข้อมูลล่าสุด" : "Recent ingestion activity"}
          </SectionHeading>

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {[
                    { text: lang === "th" ? "เวลาเริ่มต้น" : "Timestamp", right: false },
                    { text: lang === "th" ? "แหล่งข้อมูล" : "Source", right: false },
                    { text: lang === "th" ? "สถานะ" : "Status", right: false },
                    { text: lang === "th" ? "เวลาที่ใช้" : "Duration", right: true },
                    { text: lang === "th" ? "ค้นพบ / บันทึก" : "Discovered / Ingested", right: true },
                    { text: lang === "th" ? "ผลการทำงาน" : "Details", right: false },
                  ].map((column) => (
                    <th
                      key={column.text}
                      className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
                        column.right ? "text-right" : ""
                      }`}
                    >
                      {column.text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-line align-middle last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                      {log.startedAt}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] text-ink font-medium">
                        {log.source === "process3" ? "process3 (e-GP)" : "datago (data.go.th)"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-[2px] border px-1.5 py-[2px] text-[10px] font-medium ${
                          HEALTH[log.status]?.chip ?? "border-line bg-surface-2 text-ink-2"
                        }`}
                      >
                        {HEALTH[log.status]?.label[lang] ?? log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-ink-2">
                      {log.durationMs > 1000
                        ? `${(log.durationMs / 1000).toFixed(1)}s`
                        : `${log.durationMs}ms`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-ink font-medium">
                      {log.itemsDiscovered} / {log.itemsIngested}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {log.error ? (
                        <span className="text-risk">{log.error}</span>
                      ) : (
                        <span className="text-open">
                          {lang === "th" ? "สำเร็จ เรียบร้อย" : "Completed successfully"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>
      ) : null}

      {/* Extraction Review Queue */}
      <section>
        <SectionHeading
          right={
            <span className="font-mono text-[11px] text-ink-3">
              {pendingCount} {lang === "th" ? "รอดำเนินการ" : "pending"}
            </span>
          }
        >
          {lang === "th" ? "คิวตรวจทานผลการอ่านเอกสาร" : "Extraction review queue"}
        </SectionHeading>

        {/* Filter Pills & Search Bar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "all", label: { th: `ทั้งหมด (${reviewQueue.length})`, en: `All (${reviewQueue.length})` } },
              { id: "pending", label: { th: `รอตรวจทาน (${pendingCount})`, en: `Pending (${pendingCount})` } },
              { id: "misclassified", label: { th: `ตรวจประเภท (${misclassifiedCount})`, en: `Misclassified (${misclassifiedCount})` } },
              { id: "reviewed", label: { th: "ตรวจทานแล้ว", en: "Reviewed" } },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as typeof filterTab)}
                className={`rounded-[3px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                  filterTab === tab.id
                    ? "bg-ink text-surface"
                    : "border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {tab.label[lang]}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === "th" ? "ค้นหาด้วยเลขโครงการ / ชื่อ..." : "Filter by project ID / title..."}
              className={`${input} font-mono text-[12px] h-8`}
            />
          </div>
        </div>

        {filteredQueue.length === 0 ? (
          <Panel className="p-6 text-center text-[13px] text-ink-3">
            {lang === "th" ? "ไม่พบรายการในเงื่อนไขที่เลือก" : "No items match the selected filter."}
          </Panel>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredQueue.map((item) => (
              <ReviewItemCard
                key={item.docId}
                item={item}
                lang={lang}
                isOpen={expanded === item.docId}
                onToggle={() => setExpanded(expanded === item.docId ? null : item.docId)}
                resolution={handled[item.docId] || null}
                onResolution={(text) => setHandled((prev) => ({ ...prev, [item.docId]: text }))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewItemCard({
  item,
  lang,
  isOpen,
  onToggle,
  resolution,
  onResolution,
}: {
  item: ReviewItem;
  lang: "th" | "en";
  isOpen: boolean;
  onToggle: () => void;
  resolution: string | null;
  onResolution: (text: string) => void;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of item.lowFields) {
      initial[f.field] = f.value;
    }
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveAndPublish = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const fieldsPayload: UpdateReviewPayload["fields"] = {};
    for (const [key, val] of Object.entries(fieldValues)) {
      if (
        key.includes("ราคากลาง") ||
        key.includes("Reference Price") ||
        key.includes("Maximum Budget")
      ) {
        const num = Number(val.replace(/,/g, "").trim());
        fieldsPayload.referencePriceTHB = Number.isFinite(num) ? num : null;
      } else if (key.includes("งบประมาณ") || key.includes("Budget")) {
        const num = Number(val.replace(/,/g, "").trim());
        fieldsPayload.budgetTHB = Number.isFinite(num) ? num : null;
      } else if (key.includes("Deadline")) {
        fieldsPayload.submissionDeadline = val.trim() || null;
      } else if (key.includes("Penalty")) {
        fieldsPayload.penaltyClause = val.trim() || null;
      } else if (key.includes("Tech")) {
        fieldsPayload.requiredTechnologies = val.trim() || "";
      }
    }

    const res = await adminUpdateReview(item.docId, {
      action: "approve",
      fields: fieldsPayload,
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ตรวจทานและเผยแพร่แล้ว" : "Saved & Published");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReclassify = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminUpdateReview(item.docId, {
      action: "reclassify",
      reclassifyReason: item.misclassified?.likely || "Civil works — out of scope",
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "จัดประเภทเป็นงานนอกขอบเขตแล้ว" : "Reclassified out of scope");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleConfirmClassification = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminUpdateReview(item.docId, {
      action: "confirm_classification",
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ยืนยันการจัดประเภทแล้ว" : "Classification confirmed");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReExtract = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminReExtract(item.docId);

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ส่งอ่านใหม่แล้ว" : "Re-queued");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono tnum text-[10px] text-ink-3">{item.docId}</span>
            {item.reviewStatus === "approved" || resolution?.includes("บันทึก") || resolution?.includes("Published") ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[2px] text-[10px] font-medium text-open">
                {lang === "th" ? "ตรวจทานแล้ว" : "Reviewed"}
              </span>
            ) : item.reviewStatus === "rejected" || resolution?.includes("นอกขอบเขต") || resolution?.includes("scope") ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
                {lang === "th" ? "คัดออกนอกขอบเขต" : "Excluded"}
              </span>
            ) : (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[2px] text-[10px] font-medium text-amend">
                {lang === "th" ? "รอตรวจทาน" : "Pending review"}
              </span>
            )}
            {item.misclassified ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
                {lang === "th" ? "อาจจัดประเภทผิด" : "Likely misclassified"}
              </span>
            ) : null}
            {resolution ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[2px] text-[10px] font-medium text-open">
                {resolution}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-[13px] leading-thai text-ink font-medium">{item.title}</span>
          <span className="mt-0.5 block text-[11px] text-ink-3">
            {item.agency} · {item.ingestedAt}
          </span>
        </span>

        <span className="flex shrink-0 flex-col gap-1.5">
          <ConfidenceBar value={item.ocr} label="OCR" />
          <ConfidenceBar value={item.extraction} label="LLM" />
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-line bg-surface-2 px-3.5 py-3">
          {errorMsg ? (
            <div className="mb-3 rounded-[3px] border border-risk-line bg-risk-bg p-2.5 font-mono text-[12px] text-risk">
              {errorMsg}
            </div>
          ) : null}

          {item.misclassified ? (
            <div className="mb-3 flex flex-col gap-2 rounded-[3px] border border-line bg-surface p-3">
              <Label>{lang === "th" ? "การจัดประเภท" : "Classification"}</Label>
              <p className="text-[13px] leading-thai text-ink-2">
                {lang === "th"
                  ? `ระบบจัดเป็น “${item.misclassified.predicted}” แต่เนื้อหาน่าจะเป็น “${item.misclassified.likely}”`
                  : `Classified as “${item.misclassified.predicted}”, but the content reads as “${item.misclassified.likely}”.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReclassify}
                  className={btn.primary}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "จัดประเภทใหม่เป็นงานนอกขอบเขต"
                      : "Reclassify as out of scope"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmClassification}
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
                  <span className="min-w-[200px] text-[12px] leading-thai text-ink-2 font-medium">
                    {field.field}
                  </span>
                  <input
                    value={fieldValues[field.field] ?? field.value}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [field.field]: e.target.value }))
                    }
                    className={`${input} font-mono flex-1`}
                    aria-label={field.field}
                  />
                  <span className="font-mono tnum text-[11px] text-ink-3">
                    {Math.round(field.confidence * 100)}%
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveAndPublish}
                  className={btn.primary}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "บันทึกและปล่อยให้ผู้ใช้เห็น"
                      : "Save and publish"}
                </button>
                <a
                  href={`/tor/${item.docId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btn.secondary}
                >
                  {lang === "th" ? "ดูหน้าประกาศบนเว็บ" : "View on GIPDP"} ↗
                </a>
                <a
                  href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${item.docId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btn.secondary}
                >
                  {lang === "th" ? "เปิดไฟล์ต้นฉบับเทียบ" : "Open source file"} ↗
                </a>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReExtract}
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
}
