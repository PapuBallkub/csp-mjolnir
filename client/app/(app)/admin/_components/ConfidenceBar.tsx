import type { SourceHealth } from "../../../_lib/api";

export const HEALTH: Record<SourceHealth, { chip: string; label: { th: string; en: string } }> = {
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

export function confidenceTone(value: number): string {
  if (value < 0.7) return "bg-risk";
  if (value < 0.85) return "bg-amend";
  return "bg-open";
}

export function ConfidenceBar({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) {
    return (
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[10px] uppercase font-semibold tracking-[0.1em] text-ink-3">{label}</span>
        <span className="relative h-[4px] w-16 overflow-hidden rounded-full bg-line" />
        <span className="font-mono tnum text-[12px] text-ink-3">—</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-[10px] uppercase font-semibold tracking-[0.1em] text-ink-3">{label}</span>
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
