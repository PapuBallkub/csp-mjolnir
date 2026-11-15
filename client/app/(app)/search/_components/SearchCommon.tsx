import { useEffect, useState, type ReactNode } from "react";
import type { Bi, Lang } from "../../../_data/tors";
import type { ApiError, ApiResult, TorFacets } from "../../../_lib/api";
import { formatThaiDate } from "../../../_components/deadline";

/** Waits for typing to pause, so a search box doesn't send a request per keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** "1 ต.ค. 2569 14:05", in Thai time */
export function formatUpdated(iso: string, lang: Lang): string {
  const bangkok = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const time = bangkok.toISOString().slice(11, 16);
  return `${formatThaiDate(iso, lang)} ${time}`;
}

export function failureText(error: ApiError, lang: Lang): string {
  if (error.status === 0) {
    return lang === "th"
      ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้งในอีกสักครู่"
      : "We couldn't reach the server. Try again in a moment.";
  }
  return lang === "th"
    ? `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${error.status}) ลองอีกครั้งในอีกสักครู่`
    : `The server returned an error (${error.status}). Try again in a moment.`;
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-3.5 last:border-b-0">
      <h3 className="mb-2.5 text-[12px] font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * A filter's name, then a line for each note and a bullet for each badge it
 * holds, in the badges' own words (ADR 0019). Nothing is cut short.
 */
export function GroupLabel({
  label,
  members,
  notes,
  lang,
}: {
  label: Bi;
  members?: Bi[];
  notes?: Bi[];
  lang: Lang;
}) {
  const say = (words: Bi) => (lang === "th" ? words.th : words.en);
  return (
    <span className="flex flex-col">
      <span>{say(label)}</span>
      {notes?.map((note) => (
        <span key={note.en} className="text-[11px] leading-thai text-ink-3">
          {say(note)}
        </span>
      ))}
      {members?.length ? <span className="sr-only">{lang === "th" ? "รวม" : "includes"}</span> : null}
      {members?.map((member) => (
        <span key={member.en} className="flex gap-1.5 text-[11px] leading-thai text-ink-3">
          <span aria-hidden="true">•</span>
          <span>{say(member)}</span>
        </span>
      ))}
    </span>
  );
}

export function Check({
  checked,
  onChange,
  label,
  count,
  trailing,
  title,
  wrap = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  count?: number;
  trailing?: ReactNode;
  title?: string;
  /** Let a label with an explanation wrap, instead of cutting it short */
  wrap?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-2 text-[13px] leading-thai text-ink-2 hover:text-ink ${
        wrap ? "items-start" : "items-center"
      }`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={`h-3.5 w-3.5 shrink-0 accent-ink ${wrap ? "mt-[4px]" : ""}`}
      />
      <span className={`min-w-0 flex-1 ${wrap ? "" : "truncate"}`}>{label}</span>
      {trailing}
      {count !== undefined ? (
        <span className={`font-mono tnum text-[11px] text-ink-3 ${wrap ? "mt-[3px]" : ""}`}>
          {count}
        </span>
      ) : null}
    </label>
  );
}

export function Radio({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

/** A filter group whose options come from the API: loading and failure said in place. */
export function FacetList({
  facets,
  onRetry,
  lang,
  children,
}: {
  facets: ApiResult<TorFacets> | null;
  onRetry: () => void;
  lang: Lang;
  children: (data: TorFacets) => ReactNode;
}) {
  if (!facets) {
    return (
      <div className="flex animate-pulse flex-col gap-2.5 py-0.5" aria-hidden="true">
        <div className="h-3 w-4/5 rounded-[2px] bg-surface-3" />
        <div className="h-3 w-3/5 rounded-[2px] bg-surface-3" />
        <div className="h-3 w-2/3 rounded-[2px] bg-surface-3" />
      </div>
    );
  }
  if (!facets.ok) {
    return (
      <p className="text-[12px] leading-thai text-ink-3">
        {lang === "th" ? "โหลดตัวเลือกไม่สำเร็จ " : "Couldn't load the options. "}
        <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-ink">
          {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
        </button>
      </p>
    );
  }
  return <>{children(facets.data)}</>;
}

