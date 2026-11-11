import { useCallback, useMemo, useState } from "react";
import type { ApiError, AuthUser, TechnologyItem, UserProfile } from "../../../../_lib/api";
import { formatTHB } from "../../../../_data/tors";
import { btn, input, Label, Panel, SectionHeading } from "../../../../_components/ui";

const CERTIFICATION_CATEGORIES = [
  {
    key: "software",
    title: "วิศวกรรมซอฟต์แวร์และการพัฒนา",
    items: [
      "ISO/IEC 29110",
      "CMMI Level 3",
      "CMMI Level 5",
      "ISO/IEC 12207",
      "ISO/IEC 25010",
    ],
  },
  {
    key: "security",
    title: "ความมั่นคงปลอดภัย ข้อมูล และคลาวด์",
    items: [
      "ISO/IEC 27001",
      "ISO/IEC 27701",
      "ISO/IEC 27017",
      "ISO/IEC 27018",
      "PCI DSS",
      "CSA STAR",
      "ISO/IEC 15408",
    ],
  },
  {
    key: "service",
    title: "การบริหารจัดการบริการและศูนย์ข้อมูล",
    items: [
      "ISO/IEC 20000-1",
      "ISO 22301",
      "TIA-942",
    ],
  },
  {
    key: "quality",
    title: "การบริหารคุณภาพและมาตรฐาน AI",
    items: [
      "ISO 9001",
      "ISO 14001",
      "ISO/IEC 42001",
    ],
  },
] as const;

const ALL_STANDARD_CERTS: string[] = CERTIFICATION_CATEGORIES.flatMap((c) => c.items);
const PLATFORM_MAX_BUDGET = 10_000_000_000;

const CANONICAL_ARCHETYPES = [
  { id: "web-portal", label: "เว็บพอร์ทัล / เว็บไซต์ระบบงาน" },
  { id: "mobile-app", label: "โมบายแอปพลิเคชัน (iOS/Android)" },
  { id: "enterprise-erp", label: "ระบบ ERP / บัญชีและการเงิน" },
  { id: "edoc-workflow", label: "สารบรรณอิเล็กทรอนิกส์ / เวิร์กโฟลว์" },
  { id: "data-analytics", label: "คลังข้อมูล / Data Analytics / AI" },
  { id: "gis-mapping", label: "ระบบแผนที่ / GIS" },
  { id: "cybersecurity", label: "ความมั่นคงปลอดภัยไซเบอร์ (Cybersecurity)" },
  { id: "iot-telemetry", label: "IoT / ระบบตรวจวัดระยะไกล" },
  { id: "infra-networking", label: "เครือข่าย / เซิร์ฟเวอร์ / Cloud / CCTV" },
  { id: "other", label: "ระบบเฉพาะด้านอื่นๆ" },
] as const;

const PORTFOLIO_PRESETS = [
  { label: "฿500,000", value: 500_000 },
  { label: "฿1,000,000", value: 1_000_000 },
  { label: "฿2,000,000", value: 2_000_000 },
  { label: "฿5,000,000", value: 5_000_000 },
  { label: "฿10,000,000", value: 10_000_000 },
  { label: "ไม่ระบุ", value: 0 },
] as const;

const BUDGET_PRESETS = [
  {
    id: "sme-small",
    label: "< 1 ล้าน",
    min: 0,
    max: 1_000_000,
    hint: "ฟรีแลนซ์ / เริ่มต้นงานภาครัฐ",
  },
  {
    id: "sme-mid",
    label: "1 – 5 ล้าน",
    min: 1_000_000,
    max: 5_000_000,
    hint: "ทีมพัฒนา / สตาร์ทอัพ",
  },
  {
    id: "growth",
    label: "5 – 20 ล้าน",
    min: 5_000_000,
    max: 20_000_000,
    hint: "SME ขนาดกลาง / งานระดับกอง",
  },
  {
    id: "enterprise",
    label: "20 ล้าน+",
    min: 20_000_000,
    max: PLATFORM_MAX_BUDGET,
    hint: "องค์กรขนาดใหญ่ / ระดับกรม",
  },
  {
    id: "any",
    label: "รับทุกขนาด",
    min: 0,
    max: PLATFORM_MAX_BUDGET,
    hint: "ไม่จำกัดช่วงงบประมาณ",
  },
] as const;

type TechCategoryGroup = {
  id: string;
  label: string;
  matches: (category?: string) => boolean;
};

const TECH_CATEGORY_GROUPS: TechCategoryGroup[] = [
  { id: "all", label: "ทั้งหมด", matches: () => true },
  {
    id: "dev",
    label: "ภาษา & เฟรมเวิร์ก",
    matches: (cat) => ["language", "framework", "mobile"].includes(cat ?? ""),
  },
  {
    id: "data",
    label: "ฐานข้อมูล & ข้อมูล",
    matches: (cat) => ["database", "bi-analytics"].includes(cat ?? ""),
  },
  {
    id: "infra",
    label: "คลาวด์ & ระบบ",
    matches: (cat) =>
      ["cloud", "container", "virtualization", "os", "web-server", "monitoring"].includes(cat ?? ""),
  },
  {
    id: "security",
    label: "ความปลอดภัย & เครือข่าย",
    matches: (cat) => ["security", "network"].includes(cat ?? ""),
  },
  {
    id: "enterprise",
    label: "ระบบองค์กร & มาตรฐาน",
    matches: (cat) =>
      ["erp", "collaboration", "messaging", "standard", "gis"].includes(cat ?? ""),
  },
];

export function ProfileEditForm({
  user,
  initialDraft,
  techList,
  onSave,
  onCancel,
}: {
  user: AuthUser;
  initialDraft: UserProfile;
  techList: TechnologyItem[];
  techsLoading: boolean;
  onSave: (draft: UserProfile) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<UserProfile>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Search & filter states
  const [selectedTechCategory, setSelectedTechCategory] = useState<string>("all");
  const [searchSkill, setSearchSkill] = useState("");
  const [isSkillSearchFocused, setIsSkillSearchFocused] = useState(false);
  const [isSkillsSelectedExpanded, setIsSkillsSelectedExpanded] = useState(false);
  const [isSkillsBankExpanded, setIsSkillsBankExpanded] = useState(false);

  const [searchCert, setSearchCert] = useState("");
  const [isCertSearchFocused, setIsCertSearchFocused] = useState(false);
  const [isCertsSelectedExpanded, setIsCertsSelectedExpanded] = useState(false);

  // Clear modal state
  const [clearConfirmTarget, setClearConfirmTarget] = useState<"skills" | "certifications" | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(initialDraft);
  }, [draft, initialDraft]);

  const budgetError =
    draft.budgetMin > 0 && draft.budgetMax > 0 && draft.budgetMin > draft.budgetMax
      ? "งบต่ำสุดต้องไม่เกินงบสูงสุด"
      : null;

  // Available technologies
  const displaySkills = useMemo(() => {
    return Array.from(new Set([...techList.map((t) => t.name), ...draft.skills]));
  }, [techList, draft.skills]);

  const techCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of techList) {
      if (t.category) map.set(t.name.toLowerCase(), t.category);
    }
    return map;
  }, [techList]);

  const categoryFilteredSkills = useMemo(() => {
    if (selectedTechCategory === "all") return displaySkills;
    const group = TECH_CATEGORY_GROUPS.find((g) => g.id === selectedTechCategory);
    if (!group) return displaySkills;
    return displaySkills.filter((skill) => {
      const cat = techCategoryMap.get(skill.toLowerCase());
      return group.matches(cat);
    });
  }, [displaySkills, selectedTechCategory, techCategoryMap]);

  const COLLAPSED_SKILLS_LIMIT = 24;
  const visibleSkills = useMemo(() => {
    if (selectedTechCategory !== "all") return categoryFilteredSkills;
    return isSkillsBankExpanded
      ? categoryFilteredSkills
      : categoryFilteredSkills.slice(0, COLLAPSED_SKILLS_LIMIT);
  }, [categoryFilteredSkills, isSkillsBankExpanded, selectedTechCategory]);

  const visibleSelectedSkills = useMemo(() => {
    return isSkillsSelectedExpanded ? draft.skills : draft.skills.slice(0, 12);
  }, [draft.skills, isSkillsSelectedExpanded]);

  const visibleSelectedCerts = useMemo(() => {
    return isCertsSelectedExpanded ? draft.certifications : draft.certifications.slice(0, 8);
  }, [draft.certifications, isCertsSelectedExpanded]);

  const skillSuggestions = useMemo(() => {
    const q = searchSkill.trim().toLowerCase();
    if (!q) return [];
    return displaySkills.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [searchSkill, displaySkills]);

  const displayCertifications = useMemo(() => {
    return Array.from(new Set([...ALL_STANDARD_CERTS, ...draft.certifications]));
  }, [draft.certifications]);

  const certSuggestions = useMemo(() => {
    const q = searchCert.trim().toLowerCase();
    if (!q) return [];
    return displayCertifications.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [searchCert, displayCertifications]);

  const handleToggleSkill = useCallback((skillName: string) => {
    setDraft((prev) => ({
      ...prev,
      skills: prev.skills.includes(skillName)
        ? prev.skills.filter((s) => s !== skillName)
        : [...prev.skills, skillName],
    }));
  }, []);

  const handleToggleCert = useCallback((certName: string) => {
    setDraft((prev) => ({
      ...prev,
      certifications: prev.certifications.includes(certName)
        ? prev.certifications.filter((c) => c !== certName)
        : [...prev.certifications, certName],
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (budgetError) return;
    setSaving(true);
    setSaveError(null);
    const err = await onSave(draft);
    setSaving(false);
    if (err) {
      setSaveError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[4px] border border-line bg-surface p-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            โหมดแก้ไขข้อมูลโปรไฟล์ (Profile Editor)
          </h2>
          <p className="text-[12px] text-ink-3">
            ปรับปรุงข้อมูลความสามารถเพื่อเพิ่มความแม่นยำในการจับคู่งานจัดซื้อจัดจ้างภาครัฐ
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={btn.secondary}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving || !!budgetError}
            className={btn.primary}
          >
            {saving ? "กำลังบันทึก…" : "✓ บันทึกข้อมูลโปรไฟล์"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-[3px] border border-red-300 bg-red-50 p-3 text-[13px] text-red-700">
          {saveError}
        </div>
      )}

      {/* 1. Account Info (Read-only) */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <SectionHeading sub="ข้อมูลพื้นฐานสำหรับแสดงในระบบและส่งการแจ้งเตือน">
          บัญชีผู้ใช้
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>ชื่อที่แสดง</Label>
            <input value={user.name} readOnly className={`${input} text-ink-2 bg-surface-2/50`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>อีเมล</Label>
            <input value={user.email} readOnly className={`${input} font-mono text-ink-2 bg-surface-2/50`} />
          </label>
        </div>
      </Panel>

      {/* 2. Entity Type (Juristic vs Individual) */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <SectionHeading sub="สถานะทางกฎหมายสำหรับเข้าร่วมการจัดซื้อจัดจ้างภาครัฐ ใช้ประเมินเงื่อนไขเฉพาะนิติบุคคล">
          ประเภทผู้ประกอบการ (Bidding Entity Type)
        </SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, entityType: "juristic" }))}
            className={`flex flex-col items-start gap-1.5 rounded-[4px] border p-3.5 text-left transition-colors cursor-pointer ${
              (draft.entityType ?? "juristic") === "juristic"
                ? "border-ink bg-surface-2 shadow-xs"
                : "border-line bg-surface hover:border-ink/40 hover:bg-surface-2"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">
                🏢 นิติบุคคล (บริษัท / หจก.)
              </span>
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full border ${
                  (draft.entityType ?? "juristic") === "juristic"
                    ? "border-4 border-ink bg-surface"
                    : "border-line bg-surface"
                }`}
              />
            </div>
            <p className="text-[11.5px] leading-thai text-ink-3">
              เหมาะสำหรับยื่นประกวดราคา e-Bidding และโครงการทุกขนาด รองรับเงื่อนไขเฉพาะนิติบุคคล
            </p>
          </button>

          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, entityType: "individual" }))}
            className={`flex flex-col items-start gap-1.5 rounded-[4px] border p-3.5 text-left transition-colors cursor-pointer ${
              draft.entityType === "individual"
                ? "border-ink bg-surface-2 shadow-xs"
                : "border-line bg-surface hover:border-ink/40 hover:bg-surface-2"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">
                👤 บุคคลธรรมดา / ฟรีแลนซ์
              </span>
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full border ${
                  draft.entityType === "individual"
                    ? "border-4 border-ink bg-surface"
                    : "border-line bg-surface"
                }`}
              />
            </div>
            <p className="text-[11.5px] leading-thai text-ink-3">
              เหมาะสำหรับงานวิธีเฉพาะเจาะจง (งบไม่เกิน ฿500,000), งานที่ปรึกษา หรือรับงานช่วง (Subcontract)
            </p>
          </button>
        </div>
      </Panel>

      {/* 3. Budget Range & Past Portfolio */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <SectionHeading sub="กำหนดช่วงงบประมาณโครงการที่คุณสามารถรับงานได้ (บาท)">
          ช่วงงบที่คุณรับงาน (Budget Range)
        </SectionHeading>

        <div className="flex max-w-md items-center gap-2">
          <div className="flex-1">
            <input
              type="number"
              value={draft.budgetMin}
              step={100_000}
              min={0}
              max={10_000_000_000}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  budgetMin: Math.max(0, Number(e.target.value)),
                }))
              }
              className={`${input} font-mono tnum`}
              aria-label="งบต่ำสุด"
            />
          </div>
          <span className="text-ink-3">–</span>
          <div className="flex-1">
            <input
              type="number"
              value={draft.budgetMax}
              step={100_000}
              min={0}
              max={10_000_000_000}
              placeholder="0"
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  budgetMax: Math.max(0, Number(e.target.value)),
                }))
              }
              className={`${input} font-mono tnum`}
              aria-label="งบสูงสุด"
            />
          </div>
        </div>

        <p className="mt-2 font-mono tnum text-[12px] text-ink-3">
          {draft.budgetMin === 0 &&
          (draft.budgetMax === 0 || draft.budgetMax >= PLATFORM_MAX_BUDGET)
            ? "ไม่จำกัดช่วงงบประมาณ (รับทุกขนาดงาน)"
            : draft.budgetMax === 0 || draft.budgetMax >= PLATFORM_MAX_BUDGET
            ? `${formatTHB(draft.budgetMin)} ขึ้นไป (ไม่จำกัดเพดาน)`
            : `${formatTHB(draft.budgetMin)} – ${formatTHB(draft.budgetMax)}`}
        </p>

        {/* Quick Budget Presets */}
        <div className="mt-3 space-y-1.5">
          <span className="text-[11px] font-medium text-ink-3">เลือกช่วงงบด่วน (ปุ่มลัด):</span>
          <div className="flex flex-wrap gap-1.5">
            {BUDGET_PRESETS.map((preset) => {
              const active =
                draft.budgetMin === preset.min &&
                (draft.budgetMax === preset.max ||
                  (preset.max === PLATFORM_MAX_BUDGET && draft.budgetMax === 0));
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      budgetMin: preset.min,
                      budgetMax: preset.max,
                    }))
                  }
                  title={preset.hint}
                  className={`cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-ink bg-ink text-surface shadow-xs"
                      : "border-line bg-surface-2 text-ink-2 hover:border-ink/50 hover:bg-surface-3 hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Max Past Portfolio */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <Label>มูลค่าสัญญาผลงานสูงสุดที่ผ่านมา (บาท)</Label>
            <span className="text-[11px] text-ink-3 font-mono tnum">
              {(draft.maxPastPortfolioTHB ?? 0) > 0
                ? formatTHB(draft.maxPastPortfolioTHB ?? 0)
                : "ไม่ระบุ"}
            </span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <input
              type="number"
              value={draft.maxPastPortfolioTHB ?? 0}
              step={100_000}
              min={0}
              max={PLATFORM_MAX_BUDGET}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  maxPastPortfolioTHB: Math.max(0, Number(e.target.value)),
                }))
              }
              className={`${input} font-mono tnum`}
              aria-label="มูลค่าสัญญาผลงานสูงสุด"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
            TOR ภาครัฐมักกำหนดให้ผู้ยื่นมีผลงานสัญญาเดียวไม่น้อยกว่า 30% – 50% ของราคากลาง เพื่อประเมินขีดความสามารถ
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PORTFOLIO_PRESETS.map((preset) => {
              const active = (draft.maxPastPortfolioTHB ?? 0) === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      maxPastPortfolioTHB: preset.value,
                    }))
                  }
                  className={`cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-ink bg-ink text-surface shadow-xs"
                      : "border-line bg-surface-2 text-ink-2 hover:border-ink/50 hover:bg-surface-3 hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {budgetError && <p className="mt-2 text-[12px] font-medium text-red-600">{budgetError}</p>}
      </Panel>

      {/* 4. Preferred System Archetypes */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <SectionHeading sub="เลือกประเภทระบบที่คุณมีความเชี่ยวชาญ ระบบจะจัดอันดับงานในหมวดหมู่นี้ให้สูงเป็นพิเศษ (เลือกได้สูงสุด 10 รายการ)">
            สถาปัตยกรรมระบบที่ถนัด (Preferred Archetypes)
          </SectionHeading>
          {(draft.preferredArchetypes ?? []).length > 0 && (
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, preferredArchetypes: [] }))}
              className="cursor-pointer text-[11px] text-ink-3 underline hover:text-red-600"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {CANONICAL_ARCHETYPES.map((arch) => {
            const selected = (draft.preferredArchetypes ?? []).includes(arch.id);
            return (
              <button
                key={arch.id}
                type="button"
                onClick={() => {
                  setDraft((prev) => {
                    const current = prev.preferredArchetypes ?? [];
                    const next = selected
                      ? current.filter((id) => id !== arch.id)
                      : current.length < 10
                      ? [...current, arch.id]
                      : current;
                    return { ...prev, preferredArchetypes: next };
                  });
                }}
                className={`cursor-pointer inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  selected
                    ? "border-ink bg-ink text-surface shadow-xs"
                    : "border-line bg-surface-2 text-ink-2 hover:border-ink/50 hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <span>{selected ? "✓" : "+"}</span>
                <span>{arch.label}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* 5. Technical Skills */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <SectionHeading sub="เลือกเทคโนโลยีที่คุณเชี่ยวชาญเพื่อใช้จับคู่งานจัดซื้อจัดจ้างภาครัฐ (น้ำหนัก 40%)">
            ทักษะและเทคโนโลยี (Skills & Technologies)
          </SectionHeading>
          {draft.skills.length > 0 && (
            <button
              type="button"
              onClick={() => setClearConfirmTarget("skills")}
              className="cursor-pointer text-[11px] text-ink-3 underline hover:text-red-600"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        {/* Selected skills zone */}
        {draft.skills.length > 0 && (
          <div className="mt-4 rounded-md border border-line bg-surface-2/40 p-3.5">
            <div className="mb-2.5 flex items-center justify-between text-[12px]">
              <span className="font-semibold text-ink">
                ทักษะที่คุณเลือกแล้ว ({draft.skills.length})
              </span>
              <span className="text-[11px] text-ink-3">คลิกแท็กเพื่อนำออก</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {visibleSelectedSkills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => handleToggleSkill(skill)}
                  className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-ink/80 bg-ink px-2.5 py-1 font-mono text-[11px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600"
                >
                  <span>{skill}</span>
                  <span aria-hidden="true" className="text-[11px] opacity-70 group-hover:opacity-100">
                    ✕
                  </span>
                </button>
              ))}
            </div>

            {draft.skills.length > 12 && (
              <div className="mt-2.5 pt-2 border-t border-line/60 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsSkillsSelectedExpanded(!isSkillsSelectedExpanded)}
                  className="cursor-pointer text-[11px] font-medium text-ink-2 hover:text-ink"
                >
                  {isSkillsSelectedExpanded ? "ย่อลง ▴" : "ดูทั้งหมด ▾"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search Input */}
        <div className="relative mt-4 max-w-md">
          <input
            type="text"
            value={searchSkill}
            onChange={(e) => setSearchSkill(e.target.value)}
            onFocus={() => setIsSkillSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSkillSearchFocused(false), 200)}
            placeholder="ค้นหาเทคโนโลยี (เช่น React, Python, Docker, PostgreSQL)..."
            className={`${input} text-[12px]`}
          />

          {isSkillSearchFocused && skillSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-lg">
              <ul className="py-1">
                {skillSuggestions.map((skill) => {
                  const on = draft.skills.includes(skill);
                  return (
                    <li key={skill}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleToggleSkill(skill);
                          setSearchSkill("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] font-mono hover:bg-surface-2 cursor-pointer"
                      >
                        <span className={on ? "font-semibold text-ink" : "text-ink-2"}>{skill}</span>
                        <span className={`text-[10px] ${on ? "text-green-600 font-bold" : "text-ink-3"}`}>
                          {on ? "✓ เลือกแล้ว" : "+ เพิ่ม"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Category Tabs & Bank */}
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-wrap gap-1 border-b border-line pb-2">
            {TECH_CATEGORY_GROUPS.map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => setSelectedTechCategory(grp.id)}
                className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedTechCategory === grp.id
                    ? "bg-ink text-surface"
                    : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {grp.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto p-1">
            {visibleSkills.map((skill) => {
              const on = draft.skills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => handleToggleSkill(skill)}
                  className={`cursor-pointer inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    on
                      ? "border-ink bg-ink text-surface"
                      : "border-line bg-surface-2 text-ink-2 hover:border-ink/40"
                  }`}
                >
                  <span>{on ? "✓" : "+"}</span>
                  <span>{skill}</span>
                </button>
              );
            })}
          </div>

          {selectedTechCategory === "all" && categoryFilteredSkills.length > COLLAPSED_SKILLS_LIMIT && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setIsSkillsBankExpanded(!isSkillsBankExpanded)}
                className="cursor-pointer text-[11.5px] font-medium text-ink-2 hover:text-ink"
              >
                {isSkillsBankExpanded ? "ย่อรายการทักษะ ▴" : `แสดงรายการทักษะทั้งหมด (${displaySkills.length}) ▾`}
              </button>
            </div>
          )}
        </div>
      </Panel>

      {/* 6. Certifications */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <SectionHeading sub="ใบรับรองมาตรฐานสากล เช่น ISO 29110, ISO 27001, CMMI (น้ำหนัก 5%)">
            ใบรับรองและมาตรฐาน (Certifications)
          </SectionHeading>
          {draft.certifications.length > 0 && (
            <button
              type="button"
              onClick={() => setClearConfirmTarget("certifications")}
              className="cursor-pointer text-[11px] text-ink-3 underline hover:text-red-600"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        {/* Selected certs */}
        {draft.certifications.length > 0 && (
          <div className="mt-4 rounded-md border border-line bg-surface-2/40 p-3.5">
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="font-semibold text-ink">
                มาตรฐานที่คุณเลือกแล้ว ({draft.certifications.length})
              </span>
              <span className="text-[11px] text-ink-3">คลิกแท็กเพื่อนำออก</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleSelectedCerts.map((cert) => (
                <button
                  key={cert}
                  type="button"
                  onClick={() => handleToggleCert(cert)}
                  className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-ink/80 bg-ink px-2.5 py-1 text-[11px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600"
                >
                  <span>{cert}</span>
                  <span className="opacity-70 group-hover:opacity-100">✕</span>
                </button>
              ))}
            </div>

            {draft.certifications.length > 8 && (
              <div className="mt-2.5 pt-2 border-t border-line/60 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsCertsSelectedExpanded(!isCertsSelectedExpanded)}
                  className="cursor-pointer text-[11px] font-medium text-ink-2 hover:text-ink"
                >
                  {isCertsSelectedExpanded ? "ย่อลง ▴" : "ดูทั้งหมด ▾"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search Certs */}
        <div className="relative mt-4 max-w-md">
          <input
            type="text"
            value={searchCert}
            onChange={(e) => setSearchCert(e.target.value)}
            onFocus={() => setIsCertSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsCertSearchFocused(false), 200)}
            placeholder="ค้นหามาตรฐาน (เช่น ISO 29110, ISO 27001, CMMI)..."
            className={`${input} text-[12px]`}
          />

          {isCertSearchFocused && certSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-lg">
              <ul className="py-1">
                {certSuggestions.map((c) => {
                  const on = draft.certifications.includes(c);
                  return (
                    <li key={c}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleToggleCert(c);
                          setSearchCert("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-surface-2 cursor-pointer"
                      >
                        <span className={on ? "font-semibold text-ink" : "text-ink-2"}>{c}</span>
                        <span className={`text-[10px] ${on ? "text-green-600 font-bold" : "text-ink-3"}`}>
                          {on ? "✓ เลือกแล้ว" : "+ เพิ่ม"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Categories list */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CERTIFICATION_CATEGORIES.map((cat) => (
            <div key={cat.key} className="rounded border border-line p-3">
              <h4 className="text-[12px] font-semibold text-ink mb-2">{cat.title}</h4>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((item) => {
                  const on = draft.certifications.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleToggleCert(item)}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] transition-colors ${
                        on
                          ? "border-ink bg-ink text-surface"
                          : "border-line bg-surface-2 text-ink-2 hover:border-ink/40"
                      }`}
                    >
                      <span>{on ? "✓" : "+"}</span>
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* 7. Match Notification Settings (PDPA Explicit Consent) */}
      <Panel className="px-5 py-6 sm:px-7 sm:py-6">
        <SectionHeading sub="ตั้งค่าการแจ้งเตือนอีเมลเมื่อมีประกาศจัดซื้อจัดจ้างภาครัฐที่ตรงกับโปรไฟล์ของคุณ">
          การแจ้งเตือนงานที่ตรงกับคุณ (Match Alerts)
        </SectionHeading>

        <div className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            id="notif-toggle"
            checked={draft.matchNotification?.enabled ?? false}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                matchNotification: {
                  enabled: e.target.checked,
                  minScore: prev.matchNotification?.minScore ?? 75,
                  frequency: prev.matchNotification?.frequency ?? "daily",
                  includeSubcontract: prev.matchNotification?.includeSubcontract ?? true,
                },
              }))
            }
            className="mt-1 h-4 w-4 rounded border-line text-ink cursor-pointer"
          />
          <label htmlFor="notif-toggle" className="text-[13px] leading-thai text-ink cursor-pointer">
            <span className="font-medium">เปิดรับการแจ้งเตือนประกาศที่ตรงกับโปรไฟล์ทางอีเมล</span>
            <span className="block text-[11.5px] text-ink-3">
              ระบบจะส่งสรุปรายการโครงการที่คะแนนความตรงถึงเกณฑ์ที่กำหนดไปยัง {user.email} (สามารถยกเลิกได้ตลอดเวลาตาม PDPA)
            </span>
          </label>
        </div>

        {draft.matchNotification?.enabled && (
          <div className="mt-4 ml-7 space-y-4 border-l-2 border-line pl-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-[12.5px] font-medium text-ink whitespace-nowrap leading-none">
                เกณฑ์คะแนนขั้นต่ำในการแจ้งเตือน:{" "}
                <span className="font-mono text-[13px] font-bold text-ink">
                  {draft.matchNotification.minScore}%
                </span>
              </span>
              <input
                type="range"
                min={40}
                max={100}
                step={5}
                value={draft.matchNotification.minScore}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    matchNotification: {
                      enabled: prev.matchNotification?.enabled ?? true,
                      minScore: val,
                      frequency:
                        prev.matchNotification?.frequency === "instant"
                          ? "daily"
                          : prev.matchNotification?.frequency ?? "daily",
                      includeSubcontract: prev.matchNotification?.includeSubcontract ?? true,
                    },
                  }));
                }}
                className="h-2 w-full max-w-xs cursor-pointer accent-ink my-auto"
              />
            </div>

            <div>
              <Label>ความถี่ในการแจ้งเตือน:</Label>
              <div className="mt-1.5 flex gap-4 text-[12.5px] text-ink-2">
                {[
                  { id: "daily", label: "วันละครั้ง (สรุปช่วงเช้า)" },
                  { id: "weekly", label: "สัปดาห์ละครั้ง" },
                ].map((freq) => (
                  <label key={freq.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="notif-frequency"
                      checked={
                        (draft.matchNotification?.frequency ?? "daily") === freq.id ||
                        (draft.matchNotification?.frequency === "instant" && freq.id === "daily")
                      }
                      onChange={() => {
                        setDraft((prev) => ({
                          ...prev,
                          matchNotification: {
                            enabled: prev.matchNotification?.enabled ?? true,
                            minScore: prev.matchNotification?.minScore ?? 75,
                            frequency: freq.id as "daily" | "weekly",
                            includeSubcontract: prev.matchNotification?.includeSubcontract ?? true,
                          },
                        }));
                      }}
                      className="accent-ink cursor-pointer"
                    />
                    <span>{freq.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* Bottom Save / Cancel Bar */}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => {
            if (isDirty) {
              setCancelConfirmOpen(true);
            } else {
              onCancel();
            }
          }}
          disabled={saving}
          className={btn.secondary}
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving || !!budgetError}
          className={btn.primary}
        >
          {saving ? "กำลังบันทึก…" : "✓ บันทึกข้อมูลโปรไฟล์"}
        </button>
      </div>

      {/* Floating Unsaved Changes Bar */}
      {isDirty && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-xl backdrop-blur-md transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="text-[12.5px] font-medium text-ink whitespace-nowrap">
              คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
            </span>
          </div>

          <div className="h-4 w-px bg-line" />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(true)}
              disabled={saving}
              className="rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || !!budgetError}
              className="rounded-full bg-ink px-3.5 py-1 text-[12px] font-medium text-surface hover:opacity-90 transition-opacity"
            >
              {saving ? "กำลังบันทึก…" : "✓ บันทึกข้อมูล"}
            </button>
          </div>
        </aside>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          onClick={() => setCancelConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[4px] border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-ink">
              ยกเลิกการแก้ไขข้อมูล?
            </h3>
            <p className="mt-2 text-[12.5px] leading-thai text-ink-2">
              คุณมีการเปลี่ยนแปลงข้อมูลโปรไฟล์ที่ยังไม่ได้บันทึก หากยกเลิก ข้อมูลที่แก้ไขไว้จะถูกละทิ้งทั้งหมด
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className={btn.secondary}
              >
                แก้ไขต่อ
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmOpen(false);
                  onCancel();
                }}
                className={`${btn.primary} bg-red-600 hover:bg-red-700`}
              >
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {clearConfirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          onClick={() => setClearConfirmTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[4px] border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-ink">
              ยืนยันการล้างข้อมูล
            </h3>
            <p className="mt-2 text-[12.5px] leading-thai text-ink-2">
              คุณต้องการลบรายการ{clearConfirmTarget === "skills" ? "ทักษะทั้งหมด" : "ใบรับรองทั้งหมด"}ที่เลือกไว้ออกใช่หรือไม่?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirmTarget(null)}
                className={btn.secondary}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  if (clearConfirmTarget === "skills") {
                    setDraft((prev) => ({ ...prev, skills: [] }));
                  } else {
                    setDraft((prev) => ({ ...prev, certifications: [] }));
                  }
                  setClearConfirmTarget(null);
                }}
                className={`${btn.primary} bg-red-600 hover:bg-red-700`}
              >
                ยืนยันการล้าง
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
