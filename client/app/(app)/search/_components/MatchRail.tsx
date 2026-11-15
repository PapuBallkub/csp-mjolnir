import Link from "next/link";
import type { Lang, Profile } from "../../../_data/tors";
import { formatTHB, pick } from "../../../_data/tors";
import { btn, Chip, Label, Panel } from "../../../_components/ui";
import { RiskMeter } from "../../../_components/verdict";
import { SCORE_FLOORS } from "../_lib/types";
import { Check, FilterGroup, Radio } from "./SearchCommon";

export function MatchRail({
  lang,
  scoreFloor,
  setScoreFloor,
  hideClosed,
  setHideClosed,
  hideHighRisk,
  setHideHighRisk,
  profile,
}: {
  lang: Lang;
  scoreFloor: number;
  setScoreFloor: (floor: number) => void;
  hideClosed: boolean;
  setHideClosed: (hide: boolean) => void;
  hideHighRisk: boolean;
  setHideHighRisk: (hide: boolean) => void;
  profile: Profile;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {lang === "th" ? "ตัวกรอง" : "Filter"}
          </h2>
        </div>
        <FilterGroup title={lang === "th" ? "คะแนนขั้นต่ำ" : "Minimum score"}>
          {SCORE_FLOORS.map((floor) => (
            <Radio
              key={floor.id}
              name="floor"
              checked={scoreFloor === floor.id}
              onChange={() => setScoreFloor(floor.id)}
              label={pick(floor.label, lang)}
            />
          ))}
        </FilterGroup>
        <FilterGroup title={lang === "th" ? "ซ่อน" : "Hide"}>
          <Check
            checked={hideClosed}
            onChange={() => setHideClosed(!hideClosed)}
            label={lang === "th" ? "งานที่ไม่รับข้อเสนอแล้ว" : "Projects no longer taking bids"}
          />
          <Check
            checked={hideHighRisk}
            onChange={() => setHideHighRisk(!hideHighRisk)}
            label={lang === "th" ? "งานเสี่ยงล็อกสเปกสูง" : "High lock-spec risk"}
            trailing={<RiskMeter level="high" />}
          />
        </FilterGroup>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {lang === "th" ? "จับคู่จากโปรไฟล์ของคุณ" : "Ranked from your profile"}
          </h2>
        </div>

        <div className="flex flex-col gap-3.5 px-3 py-3.5">
          <div>
            <Label>{lang === "th" ? "ทักษะ" : "Skills"}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.skills.length === 0 ? (
                <span className="text-[12px] text-ink-3">
                  {lang === "th" ? "ยังไม่ได้เลือก" : "None selected"}
                </span>
              ) : (
                profile.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)
              )}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <Label>{lang === "th" ? "ช่วงงบที่รับได้" : "Budget range"}</Label>
            <p className="mt-1 font-mono tnum text-[12px] text-ink">
              {profile.budgetMin === 0 && profile.budgetMax === 0
                ? lang === "th"
                  ? "ไม่จำกัดช่วงงบ (ทุกขนาดงาน)"
                  : "Any budget (unconstrained)"
                : profile.budgetMax === 0
                  ? lang === "th"
                    ? `${formatTHB(profile.budgetMin)} ขึ้นไป`
                    : `${formatTHB(profile.budgetMin)}+`
                  : `${formatTHB(profile.budgetMin)} – ${formatTHB(profile.budgetMax)}`}
            </p>
          </div>

          <Link href="/profile" className={`${btn.secondary} w-full`}>
            {lang === "th" ? "แก้ไขโปรไฟล์" : "Edit your profile"}
          </Link>
        </div>
      </Panel>
    </div>
  );
}

