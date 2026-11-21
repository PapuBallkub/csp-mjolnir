import Link from "next/link";
import type { Profile } from "../../../_data/tors";
import { formatTHB } from "../../../_data/tors";
import { btn, Chip, Label, Panel } from "../../../_components/ui";
import { RiskMeter } from "../../../_components/verdict";
import { SCORE_FLOORS } from "../_lib/types";
import { Check, FilterGroup, Radio } from "./SearchCommon";

export function MatchRail({
  scoreFloor,
  setScoreFloor,
  hideClosed,
  setHideClosed,
  hideHighRisk,
  setHideHighRisk,
  profile,
}: {
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
            ตัวกรอง
          </h2>
        </div>
        <FilterGroup title="คะแนนขั้นต่ำ">
          {SCORE_FLOORS.map((floor) => (
            <Radio
              key={floor.id}
              name="floor"
              checked={scoreFloor === floor.id}
              onChange={() => setScoreFloor(floor.id)}
              label={floor.label}
            />
          ))}
        </FilterGroup>
        <FilterGroup title="ซ่อน">
          <Check
            checked={hideClosed}
            onChange={() => setHideClosed(!hideClosed)}
            label="งานที่ไม่รับข้อเสนอแล้ว"
          />
          <Check
            checked={hideHighRisk}
            onChange={() => setHideHighRisk(!hideHighRisk)}
            label="งานเสี่ยงล็อกสเปกสูง"
            trailing={<RiskMeter level="high" />}
          />
        </FilterGroup>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            จับคู่จากโปรไฟล์ของคุณ
          </h2>
        </div>

        <div className="flex flex-col gap-3.5 px-3 py-3.5">
          <div>
            <Label>ทักษะ</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.skills.length === 0 ? (
                <span className="text-[12px] text-ink-3">
                  ยังไม่ได้เลือก
                </span>
              ) : (
                profile.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)
              )}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <Label>ช่วงงบที่รับได้</Label>
            <p className="mt-1 font-mono tnum text-[12px] text-ink">
              {profile.budgetMin === 0 && profile.budgetMax === 0
                ? "ไม่จำกัดช่วงงบ (ทุกขนาดงาน)"
                : profile.budgetMax === 0
                  ? `${formatTHB(profile.budgetMin)} ขึ้นไป`
                  : `${formatTHB(profile.budgetMin)} – ${formatTHB(profile.budgetMax)}`}
            </p>
          </div>

          <Link href="/profile" className={`${btn.secondary} w-full`}>
            แก้ไขโปรไฟล์
          </Link>
        </div>
      </Panel>
    </div>
  );
}
