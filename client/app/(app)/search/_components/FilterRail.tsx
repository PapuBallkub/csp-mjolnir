import { useState } from "react";
import Link from "next/link";
import type { ApiResult, TorFacets, TorStatus } from "../../../_lib/api";
import { STATUS_GROUPS, announcementLabel } from "../../../_lib/stage";
import { STATUSES, showsEveryStatus } from "../../../_lib/catalog";
import { input, Panel } from "../../../_components/ui";
import { RiskMeter } from "../../../_components/verdict";
import { BUDGET_BANDS, DEADLINE_BANDS, toggle } from "../_lib/types";
import { Check, FacetList, FilterGroup, GroupLabel, Radio } from "./SearchCommon";

export function FilterRail({
  statuses,
  setStatuses,
  amendedOnly,
  setAmendedOnly,
  hideHighRisk,
  setHideHighRisk,
  minScore,
  setMinScore,
  canMatch,
  hasSkills = true,
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
  statuses: TorStatus[];
  setStatuses: (statuses: TorStatus[]) => void;
  amendedOnly: boolean;
  setAmendedOnly: (amendedOnly: boolean) => void;
  hideHighRisk: boolean;
  setHideHighRisk: (hideHighRisk: boolean) => void;
  minScore: number;
  setMinScore: (score: number) => void;
  canMatch: boolean;
  hasSkills?: boolean;
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
  const [techQuery, setTechQuery] = useState("");
  const [agencyQuery, setAgencyQuery] = useState("");

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
        <h2 className="text-[12px] font-semibold text-ink">
          ตัวกรอง
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink cursor-pointer"
          >
            {`ล้างทั้งหมด (${activeCount})`}
          </button>
        ) : null}
      </div>

      <FilterGroup title="สถานะ">
        {STATUSES.map((status) => (
          <Check
            key={status}
            checked={statuses.includes(status)}
            onChange={() => setStatuses(toggle(statuses, status))}
            wrap
            label={<GroupLabel {...STATUS_GROUPS[status]} />}
            count={facets?.ok ? facets.data.statuses[status] : undefined}
          />
        ))}
        {!showsEveryStatus(statuses) ? (
          <button
            type="button"
            onClick={() => setStatuses(STATUSES)}
            className="self-start text-[11px] leading-thai text-ink-2 underline underline-offset-2 hover:text-ink cursor-pointer"
          >
            แสดงทุกสถานะ รวมโครงการในอดีต
          </button>
        ) : null}
        <div className="mt-0.5 border-t border-line pt-2.5">
          <Check
            checked={amendedOnly}
            onChange={() => setAmendedOnly(!amendedOnly)}
            wrap
            label={
              <GroupLabel
                label="เฉพาะที่แก้ไขแล้ว"
                members={[announcementLabel("D2")]}
              />
            }
            count={facets?.ok ? facets.data.amended : undefined}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="ความเหมาะสมกับทักษะของคุณ">
        {!canMatch ? (
          <div className="space-y-1.5">
            <p className="text-[11.5px] leading-thai text-ink-3">
              ลงชื่อเข้าใช้เพื่อกรองและจัดอันดับตามทักษะและงบประมาณของคุณ
            </p>
            <Link
              href="/auth"
              className="inline-block text-[11.5px] font-medium text-ink underline underline-offset-2 hover:opacity-80 cursor-pointer"
            >
              ลงชื่อเข้าใช้ →
            </Link>
          </div>
        ) : !hasSkills ? (
          <div className="space-y-1.5">
            <span className="inline-block rounded-[3px] border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              ยังไม่ได้ตั้งค่าโปรไฟล์
            </span>
            <p className="text-[11.5px] leading-thai text-ink-3">
              ตั้งค่าเงื่อนไขในโปรไฟล์เพื่อเปิดใช้งานการคำนวณและกรองคะแนนความเหมาะสม
            </p>
            <Link
              href="/profile"
              className="inline-block text-[11.5px] font-medium text-ink underline underline-offset-2 hover:opacity-80 cursor-pointer"
            >
              ไปที่หน้าตั้งค่าโปรไฟล์ →
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <span className="text-[13px] leading-thai text-ink-2">
                {minScore > 0 ? (
                  `ตั้งแต่ ${minScore}% ขึ้นไป`
                ) : (
                  "ทุกคะแนน (0%)"
                )}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              aria-label="คะแนนขั้นต่ำในการจับคู่"
              className="h-1.5 w-full cursor-pointer accent-ink my-1"
            />

            <div className="flex justify-between text-[10.5px] font-mono text-ink-3">
              <span>0%</span>
              <span className="text-ink-2">50%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </FilterGroup>

      <FilterGroup title="คัดกรองความเสี่ยง">
        <Check
          checked={hideHighRisk}
          onChange={() => setHideHighRisk(!hideHighRisk)}
          label="ซ่อนงานเสี่ยงล็อกสเปกสูง"
          trailing={<RiskMeter level="high" />}
        />
      </FilterGroup>

      <FilterGroup title="ราคากลาง">
        {BUDGET_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="budget"
            checked={budgetBand === b.id}
            onChange={() => setBudgetBand(b.id)}
            label={b.label}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="กำหนดยื่นข้อเสนอ">
        {DEADLINE_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="deadline"
            checked={deadlineBand === b.id}
            onChange={() => setDeadlineBand(b.id)}
            label={b.label}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="เทคโนโลยี">
        <FacetList facets={facets} onRetry={onRetryFacets}>
          {(data) => {
            if (data.technologies.length === 0) {
              return <p className="text-[12px] text-ink-3">ยังไม่มีข้อมูล</p>;
            }
            const q = techQuery.trim().toLowerCase();
            const filtered = q
              ? data.technologies.filter((t) => t.name.toLowerCase().includes(q))
              : data.technologies;
            return (
              <div className="flex flex-col gap-2">
                {data.technologies.length > 8 ? (
                  <input
                    id="filter-tech-search"
                    name="techSearch"
                    type="search"
                    value={techQuery}
                    onChange={(e) => setTechQuery(e.target.value)}
                    placeholder="กรองชื่อเทคโนโลยี..."
                    aria-label="กรองรายการเทคโนโลยี"
                    className={`${input} h-7 text-[11.5px]`}
                  />
                ) : null}
                {filtered.length === 0 ? (
                  <p className="text-[11.5px] text-ink-3">ไม่พบเทคโนโลยีที่ตรงกับ &ldquo;{techQuery}&rdquo;</p>
                ) : (
                  <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                    {filtered.map((term) => (
                      <Check
                        key={term.name}
                        checked={techFilter.includes(term.name)}
                        onChange={() => setTechFilter(toggle(techFilter, term.name))}
                        label={<span className="font-mono text-[12px]">{term.name}</span>}
                        count={term.count}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </FacetList>
      </FilterGroup>

      <FilterGroup title="หน่วยงาน">
        <FacetList facets={facets} onRetry={onRetryFacets}>
          {(data) => {
            if (data.agencies.length === 0) {
              return <p className="text-[12px] text-ink-3">ยังไม่มีข้อมูล</p>;
            }
            const q = agencyQuery.trim().toLowerCase();
            const filtered = q
              ? data.agencies.filter((a) => a.name.toLowerCase().includes(q))
              : data.agencies;
            return (
              <div className="flex flex-col gap-2">
                {data.agencies.length > 8 ? (
                  <input
                    id="filter-agency-search"
                    name="agencySearch"
                    type="search"
                    value={agencyQuery}
                    onChange={(e) => setAgencyQuery(e.target.value)}
                    placeholder="กรองชื่อหน่วยงาน..."
                    aria-label="กรองรายการหน่วยงาน"
                    className={`${input} h-7 text-[11.5px]`}
                  />
                ) : null}
                {filtered.length === 0 ? (
                  <p className="text-[11.5px] text-ink-3">ไม่พบหน่วยงานที่ตรงกับ &ldquo;{agencyQuery}&rdquo;</p>
                ) : (
                  <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                    {filtered.map((agency) => (
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
                )}
              </div>
            );
          }}
        </FacetList>
      </FilterGroup>
    </Panel>
  );
}
