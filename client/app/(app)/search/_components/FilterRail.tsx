import type { Lang } from "../../../_data/tors";
import { pick } from "../../../_data/tors";
import type { ApiResult, TorFacets, TorStatus } from "../../../_lib/api";
import { STATUS_GROUPS, announcementLabel } from "../../../_lib/stage";
import { STATUSES, showsEveryStatus } from "../../../_lib/catalog";
import { Panel } from "../../../_components/ui";
import { RiskMeter } from "../../../_components/verdict";
import { BUDGET_BANDS, DEADLINE_BANDS, toggle } from "../_lib/types";
import { Check, FacetList, FilterGroup, GroupLabel, Radio } from "./SearchCommon";

export function FilterRail({
  lang,
  statuses,
  setStatuses,
  amendedOnly,
  setAmendedOnly,
  hideHighRisk,
  setHideHighRisk,
  budgetBand,
  setBudgetBand,
  deadlineBand,
  setDeadlineBand,
  techFilter,
  setTechFilter,
  agencyFilter,
  setAgencyFilter,
  activeCount,
  clearAll,
  facets,
  onRetryFacets,
}: {
  lang: Lang;
  statuses: TorStatus[];
  setStatuses: (statuses: TorStatus[]) => void;
  amendedOnly: boolean;
  setAmendedOnly: (amendedOnly: boolean) => void;
  hideHighRisk: boolean;
  setHideHighRisk: (hideHighRisk: boolean) => void;
  budgetBand: string;
  setBudgetBand: (band: string) => void;
  deadlineBand: string;
  setDeadlineBand: (band: string) => void;
  techFilter: string[];
  setTechFilter: (techs: string[]) => void;
  agencyFilter: string[];
  setAgencyFilter: (agencies: string[]) => void;
  activeCount: number;
  clearAll: () => void;
  facets: ApiResult<TorFacets> | null;
  onRetryFacets: () => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
        <h2 className="text-[12px] font-semibold text-ink">
          {lang === "th" ? "ตัวกรอง" : "Filters"}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {lang === "th" ? `ล้างทั้งหมด (${activeCount})` : `Clear all (${activeCount})`}
          </button>
        ) : null}
      </div>

      <FilterGroup title={lang === "th" ? "สถานะ" : "Status"}>
        {STATUSES.map((status) => (
          <Check
            key={status}
            checked={statuses.includes(status)}
            onChange={() => setStatuses(toggle(statuses, status))}
            wrap
            label={<GroupLabel lang={lang} {...STATUS_GROUPS[status]} />}
            count={facets?.ok ? facets.data.statuses[status] : undefined}
          />
        ))}
        {!showsEveryStatus(statuses) ? (
          <button
            type="button"
            onClick={() => setStatuses(STATUSES)}
            className="self-start text-[11px] leading-thai text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {lang === "th" ? "แสดงทุกสถานะ รวมโครงการในอดีต" : "Show every status, past projects too"}
          </button>
        ) : null}
        <div className="mt-0.5 border-t border-line pt-2.5">
          <Check
            checked={amendedOnly}
            onChange={() => setAmendedOnly(!amendedOnly)}
            wrap
            label={
              <GroupLabel
                lang={lang}
                label={{ th: "เฉพาะที่แก้ไขแล้ว", en: "Amended only" }}
                members={[announcementLabel("D2")]}
              />
            }
            count={facets?.ok ? facets.data.amended : undefined}
          />
        </div>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "คัดกรองความเสี่ยง" : "Risk"}>
        <Check
          checked={hideHighRisk}
          onChange={() => setHideHighRisk(!hideHighRisk)}
          label={lang === "th" ? "ซ่อนงานเสี่ยงล็อกสเปกสูง" : "Hide high lock-spec risk"}
          trailing={<RiskMeter level="high" />}
        />
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "ราคากลาง" : "Reference price"}>
        {BUDGET_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="budget"
            checked={budgetBand === b.id}
            onChange={() => setBudgetBand(b.id)}
            label={pick(b.label, lang)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "กำหนดยื่นข้อเสนอ" : "Deadline"}>
        {DEADLINE_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="deadline"
            checked={deadlineBand === b.id}
            onChange={() => setDeadlineBand(b.id)}
            label={pick(b.label, lang)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "เทคโนโลยี" : "Tech stack"}>
        <FacetList facets={facets} onRetry={onRetryFacets} lang={lang}>
          {(data) =>
            data.technologies.length === 0 ? (
              <p className="text-[12px] text-ink-3">{lang === "th" ? "ยังไม่มีข้อมูล" : "None yet"}</p>
            ) : (
              <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {data.technologies.map((term) => (
                  <Check
                    key={term.name}
                    checked={techFilter.includes(term.name)}
                    onChange={() => setTechFilter(toggle(techFilter, term.name))}
                    label={<span className="font-mono text-[12px]">{term.name}</span>}
                    count={term.count}
                  />
                ))}
              </div>
            )
          }
        </FacetList>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "หน่วยงาน" : "Agency"}>
        <FacetList facets={facets} onRetry={onRetryFacets} lang={lang}>
          {(data) =>
            data.agencies.length === 0 ? (
              <p className="text-[12px] text-ink-3">{lang === "th" ? "ยังไม่มีข้อมูล" : "None yet"}</p>
            ) : (
              <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {data.agencies.map((agency) => (
                  <Check
                    key={agency.name}
                    checked={agencyFilter.includes(agency.name)}
                    onChange={() => setAgencyFilter(toggle(agencyFilter, agency.name))}
                    label={agency.name}
                    title={agency.name}
                    count={agency.count}
                  />
                ))}
              </div>
            )
          }
        </FacetList>
      </FilterGroup>
    </Panel>
  );
}

