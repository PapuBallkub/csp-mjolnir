import type { PipelineStageSnapshot } from "../../../_lib/api";
import { Panel, SectionHeading } from "../../../_components/ui";

export function PipelineStageFunnel({
  stageSnapshot,
}: {
  stageSnapshot?: PipelineStageSnapshot;
}) {
  const stages = stageSnapshot?.stages || {};
  const insights = stageSnapshot?.insights || {};

  const funnel = [
    {
      num: 1,
      badge: "Feed / RSS",
      title: "1. ตรวจพบประกาศ",
      count: stages.fetched ?? 0,
      sub: "ดึงผ่าน RSS process3 / CKAN data.go.th",
      tech: "process3 & CKAN",
      highlight: false,
    },
    {
      num: 2,
      badge: "PDF Package",
      title: "2. ดาวน์โหลดเอกสาร",
      count: stages.downloaded ?? 0,
      sub: "ไฟล์แนบ TOR และราคากลางพร้อมอ่าน",
      tech: "e-GP Archive",
      highlight: false,
    },
    {
      num: 3,
      badge: "OCR Engine",
      title: "3. ทำ OCR ดิจิทัล",
      count: stages.ocr_done ?? 0,
      extra: (stages.ocr_preview ?? 0) > 0 ? `+${stages.ocr_preview} preview` : null,
      sub: "แปลงสแกน PDF เป็นข้อความดิจิทัล",
      tech: "Tesseract OCR",
      highlight: false,
    },
    {
      num: 4,
      badge: "Gemini AI",
      title: "4. สกัดข้อมูล IT สำเร็จ",
      count: insights.extracted ?? 0,
      extra: (insights.excluded ?? 0) > 0 ? `${insights.excluded} non-IT` : null,
      sub: "พร้อมให้ผู้ใช้ค้นหาและประเมินความเสี่ยง",
      tech: "Gemini 2.5 Flash",
      highlight: true,
    },
  ];

  return (
    <section className="mb-8 w-full">
      <SectionHeading
        sub="การเคลื่อนที่ของข้อมูลตามลำดับขั้น ตั้งแต่ดึงประกาศ e-GP จนถึงสกัดข้อมูลด้วย AI"
      >
        โฟลว์สถานะ Pipeline
      </SectionHeading>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {funnel.map((item, idx) => (
          <Panel
            key={item.num}
            className={`p-4 flex flex-col justify-between relative transition-shadow hover:shadow-xs ${
              item.highlight
                ? "border-open-line bg-open-bg/15"
                : "border-line bg-surface"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-ink-3">
                  STAGE {item.num}
                </span>
                <span
                  className={`rounded-full border px-2 py-[1px] text-[10px] ${
                    item.highlight
                      ? "border-open-line bg-open-bg text-open font-semibold"
                      : "border-line bg-surface-2 text-ink-2"
                  }`}
                >
                  {item.badge}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p
                  className={`font-mono tnum text-[26px] font-bold ${
                    item.highlight ? "text-open" : "text-ink"
                  }`}
                >
                  {item.count.toLocaleString()}
                </p>
                {item.extra && (
                  <span className="text-[11px] text-amend font-medium">
                    ({item.extra})
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] font-medium leading-tight text-ink">
                {item.title}
              </p>
            </div>
            <div className="mt-3 border-t border-line/60 pt-2 flex items-center justify-between text-[11px] text-ink-3">
              <span className="leading-thai truncate">{item.sub}</span>
              {idx < funnel.length - 1 && (
                <span className="hidden lg:inline text-ink-3 ml-1">→</span>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
