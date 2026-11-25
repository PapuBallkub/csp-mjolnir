import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../../../_lib/api";
import type { ApiError, AuthUser, TechnologyItem, UserProfile } from "../../../../_lib/api";
import { formatTHB } from "../../../../_data/tors";
import { Building2, User as UserIcon } from "lucide-react";
import { Label } from "../../../../_components/ui";
import { Card, CardHeader, Inset, Tile, field, pbtn, toggleChip } from "./profile-ui";

const REQUEST_TECH_CATEGORIES = [
  { value: "", label: "ไม่ระบุหมวดหมู่" },
  { value: "framework", label: "เฟรมเวิร์ก / ไลบรารี (Framework)" },
  { value: "language", label: "ภาษาโปรแกรม (Language)" },
  { value: "mobile", label: "โมบายแอปพลิเคชัน (Mobile)" },
  { value: "database", label: "ฐานข้อมูล (Database)" },
  { value: "bi-analytics", label: "BI และ Data Analytics" },
  { value: "cloud", label: "คลาวด์ (Cloud)" },
  { value: "container", label: "คอนเทนเนอร์ / Orchestration" },
  { value: "virtualization", label: "Virtualization" },
  { value: "os", label: "ระบบปฏิบัติการ (OS)" },
  { value: "web-server", label: "Web Server" },
  { value: "monitoring", label: "Monitoring / Observability" },
  { value: "security", label: "ความปลอดภัย (Security)" },
  { value: "network", label: "เครือข่าย (Network)" },
  { value: "erp", label: "ระบบองค์กร (ERP)" },
  { value: "gis", label: "ระบบแผนที่ (GIS)" },
  { value: "collaboration", label: "การทำงานร่วมกัน (Collaboration)" },
  { value: "messaging", label: "ระบบส่งข้อความ / คิว (Messaging)" },
  { value: "standard", label: "มาตรฐานและโปรโตคอล (Standard)" },
] as const;

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
  hasPassword,
  initialDraft,
  techList,
  onTechnologyAdded,
  onSave,
  onCancel,
}: {
  user: AuthUser;
  hasPassword: boolean;
  initialDraft: UserProfile;
  techList: TechnologyItem[];
  techsLoading: boolean;
  onTechnologyAdded: (tech: TechnologyItem) => void;
  onSave: (draft: UserProfile, consent: boolean) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<UserProfile>(initialDraft);
  const [consent, setConsent] = useState<boolean>(user.notificationConsent ?? false);
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

  // Request new technology / certification modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState<"technology" | "certification">("technology");
  const [requestName, setRequestName] = useState("");
  const [requestCategory, setRequestCategory] = useState("framework");
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<
    { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Clear modal state
  const [clearConfirmTarget, setClearConfirmTarget] = useState<"skills" | "certifications" | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#notification-settings") return;
    const raf = window.requestAnimationFrame(() => {
      const target = document.getElementById("notification-settings");
      if (!target) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      target.scrollIntoView({ behavior, block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(draft) !== JSON.stringify(initialDraft) ||
      consent !== (user.notificationConsent ?? false)
    );
  }, [draft, initialDraft, consent, user.notificationConsent]);

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

  const hasExactSkillMatch = useMemo(() => {
    const q = searchSkill.trim().toLowerCase();
    if (!q) return false;
    return displaySkills.some((t) => t.toLowerCase() === q);
  }, [searchSkill, displaySkills]);

  const openRequestModal = useCallback(
    (initialName = "", type: "technology" | "certification" = "technology") => {
      setRequestType(type);
      setRequestName(initialName);
      setRequestCategory(type === "technology" ? "framework" : "standard");
      setRequestReason("");
      setRequestStatus({ kind: "idle" });
      setIsSkillSearchFocused(false);
      setIsCertSearchFocused(false);
      setIsRequestModalOpen(true);
    },
    []
  );

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = requestName.trim();
    if (!trimmed || requestSubmitting) return;

    setRequestSubmitting(true);
    setRequestStatus({ kind: "idle" });

    const res = await api.requestTechnology({
      name: trimmed,
      category:
        requestType === "certification" ? "standard" : requestCategory || undefined,
      reason: requestReason.trim() || undefined,
    });

    setRequestSubmitting(false);
    if (res.ok) {
      const addedName = res.data.technology?.name || trimmed;
      if (requestType === "technology") {
        const addedTech = res.data.technology?.name
          ? { name: res.data.technology.name, category: res.data.technology.category }
          : { name: trimmed, category: requestCategory || undefined };
        onTechnologyAdded(addedTech);
        setDraft((prev) =>
          prev.skills.includes(addedTech.name) || prev.skills.length >= 150
            ? prev
            : { ...prev, skills: [...prev.skills, addedTech.name] }
        );
        setSearchSkill("");
        setRequestStatus({
          kind: "success",
          message: res.data.alreadyExists
            ? `พบ "${addedName}" ในระบบแล้ว และเพิ่มเข้าทักษะของคุณเรียบร้อย`
            : `ส่งคำขอเพิ่ม "${addedName}" ไปยังผู้ดูแลระบบ และเพิ่มเข้าทักษะของคุณแล้ว`,
        });
      } else {
        setDraft((prev) =>
          prev.certifications.includes(addedName) || prev.certifications.length >= 50
            ? prev
            : { ...prev, certifications: [...prev.certifications, addedName] }
        );
        setSearchCert("");
        setRequestStatus({
          kind: "success",
          message: res.data.alreadyExists
            ? `พบ "${addedName}" ในระบบแล้ว และเพิ่มเข้าใบรับรองของคุณเรียบร้อย`
            : `ส่งคำขอเพิ่มมาตรฐาน "${addedName}" ไปยังผู้ดูแลระบบ และเพิ่มเข้าใบรับรองของคุณแล้ว`,
        });
      }
      setTimeout(() => {
        setIsRequestModalOpen(false);
        setRequestStatus({ kind: "idle" });
      }, 1400);
    } else {
      setRequestStatus({
        kind: "error",
        message:
          res.error?.message ||
          (requestType === "certification"
            ? "ส่งคำขอเพิ่มมาตรฐานไม่สำเร็จ กรุณาลองอีกครั้ง"
            : "ส่งคำขอเพิ่มเทคโนโลยีไม่สำเร็จ กรุณาลองอีกครั้ง"),
      });
    }
  };

  const displayCertifications = useMemo(() => {
    return Array.from(new Set([...ALL_STANDARD_CERTS, ...draft.certifications]));
  }, [draft.certifications]);

  const certSuggestions = useMemo(() => {
    const q = searchCert.trim().toLowerCase();
    if (!q) return [];
    return displayCertifications.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [searchCert, displayCertifications]);

  const hasExactCertMatch = useMemo(() => {
    const q = searchCert.trim().toLowerCase();
    if (!q) return false;
    return displayCertifications.some((c) => c.toLowerCase() === q);
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
    const err = await onSave(draft, consent);
    setSaving(false);
    if (err) {
      setSaveError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const entityType = draft.entityType ?? "juristic";
  const ENTITY_OPTIONS = [
    {
      id: "juristic" as const,
      icon: Building2,
      title: "นิติบุคคล (บริษัท / หจก.)",
      body: "เหมาะสำหรับยื่นประกวดราคา e-Bidding และโครงการทุกขนาด รองรับเงื่อนไขเฉพาะนิติบุคคล",
    },
    {
      id: "individual" as const,
      icon: UserIcon,
      title: "บุคคลธรรมดา / ฟรีแลนซ์",
      body: "เหมาะสำหรับงานวิธีเฉพาะเจาะจง (งบไม่เกิน ฿500,000), งานที่ปรึกษา หรือรับงานช่วง (Subcontract)",
    },
  ];

  return (
    <>
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-5"
    >
      {/* Top action bar */}
      <Card as="div" className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">โหมดแก้ไขข้อมูลโปรไฟล์</h2>
          <p className="mt-0.5 text-[12px] leading-thai text-ink-3">
            ปรับปรุงข้อมูลความสามารถเพื่อเพิ่มความแม่นยำในการจับคู่งานจัดซื้อจัดจ้างภาครัฐ
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className={pbtn.secondary}>
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || !!budgetError} className={pbtn.primary}>
            {saving ? "กำลังบันทึก…" : "✓ บันทึกข้อมูลโปรไฟล์"}
          </button>
        </div>
      </Card>

      {saveError && (
        <div
          role="alert"
          className="rounded-xl border border-risk-line bg-risk-bg px-4 py-3 text-[12.5px] text-risk"
        >
          {saveError}
        </div>
      )}

      {/* 1. Account info (read-only) */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="บัญชีผู้ใช้"
          sub="ข้อมูลพื้นฐานสำหรับแสดงในระบบและส่งการแจ้งเตือน"
          right={
            hasPassword ? (
              <Link href="/account" className={`${pbtn.secondary} h-8 px-3.5 text-[12px]`}>
                เปลี่ยนรหัสผ่าน
              </Link>
            ) : undefined
          }
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>ชื่อที่แสดง</Label>
            <input value={user.name} readOnly className={`${field} bg-surface-2/60 text-ink-2`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>อีเมล</Label>
            <input value={user.email} readOnly className={`${field} bg-surface-2/60 text-ink-2`} />
          </label>
        </div>
      </Card>

      {/* 2. Entity type */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="ประเภทผู้ประกอบการ"
          sub="สถานะทางกฎหมายสำหรับเข้าร่วมการจัดซื้อจัดจ้างภาครัฐ ใช้ประเมินเงื่อนไขเฉพาะนิติบุคคล"
        />
        <div role="radiogroup" aria-label="ประเภทผู้ประกอบการ" className="mt-4 grid gap-3 sm:grid-cols-2">
          {ENTITY_OPTIONS.map((opt) => {
            const selected = entityType === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDraft((prev) => ({ ...prev, entityType: opt.id }))}
                className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-ink bg-surface-2 ring-1 ring-ink"
                    : "border-line bg-surface hover:border-ink/40 hover:bg-surface-2"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                    {opt.title}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`inline-block h-4 w-4 shrink-0 rounded-full border bg-surface ${
                      selected ? "border-[5px] border-ink" : "border-line-2"
                    }`}
                  />
                </div>
                <p className="text-[11.5px] leading-thai text-ink-3">{opt.body}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 3. Budget range & past portfolio */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="ช่วงงบที่คุณรับงาน"
          sub="กำหนดช่วงงบประมาณโครงการที่คุณสามารถรับงานได้ (บาท)"
        />

        <Inset className="mt-4 p-4">
          <div className="flex max-w-md items-center gap-2">
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
              className={`${field} tnum flex-1`}
              aria-label="งบต่ำสุด"
            />
            <span aria-hidden="true" className="text-ink-3">–</span>
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
              className={`${field} tnum flex-1`}
              aria-label="งบสูงสุด"
            />
          </div>

          <p className="tnum mt-2 text-[12px] text-ink-2">
            {draft.budgetMin === 0 &&
              (draft.budgetMax === 0 || draft.budgetMax >= PLATFORM_MAX_BUDGET)
              ? "ไม่จำกัดช่วงงบประมาณ (รับทุกขนาดงาน)"
              : draft.budgetMax === 0 || draft.budgetMax >= PLATFORM_MAX_BUDGET
                ? `${formatTHB(draft.budgetMin)} ขึ้นไป (ไม่จำกัดเพดาน)`
                : `${formatTHB(draft.budgetMin)} – ${formatTHB(draft.budgetMax)}`}
          </p>
          {budgetError && (
            <p role="alert" className="mt-1.5 text-[12px] font-medium text-red-600 dark:text-red-400">
              {budgetError}
            </p>
          )}

          <div className="mt-3.5">
            <span className="text-[11px] font-medium text-ink-3">เลือกช่วงงบด่วน</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => {
                const active =
                  draft.budgetMin === preset.min &&
                  (draft.budgetMax === preset.max ||
                    (preset.max === PLATFORM_MAX_BUDGET && draft.budgetMax === 0));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        budgetMin: preset.min,
                        budgetMax: preset.max,
                      }))
                    }
                    title={preset.hint}
                    className={toggleChip(active)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Inset>

        {/* Max past portfolio */}
        <Inset className="mt-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label htmlFor="max-past-portfolio">มูลค่าสัญญาผลงานสูงสุดที่ผ่านมา (บาท)</Label>
            <span className="tnum text-[11.5px] text-ink-2">
              {(draft.maxPastPortfolioTHB ?? 0) > 0
                ? formatTHB(draft.maxPastPortfolioTHB ?? 0)
                : "ไม่ระบุ"}
            </span>
          </div>
          <input
            id="max-past-portfolio"
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
            className={`${field} tnum mt-1.5 max-w-xs`}
          />
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
                  aria-pressed={active}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      maxPastPortfolioTHB: preset.value,
                    }))
                  }
                  className={toggleChip(active)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </Inset>
      </Card>

      {/* 4. Preferred system archetypes */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="สถาปัตยกรรมระบบที่ถนัด"
          sub="เลือกประเภทระบบที่คุณมีความเชี่ยวชาญ ระบบจะจัดอันดับงานในหมวดหมู่นี้ให้สูงเป็นพิเศษ (เลือกได้สูงสุด 10 รายการ)"
          right={
            (draft.preferredArchetypes ?? []).length > 0 ? (
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, preferredArchetypes: [] }))}
                className={pbtn.quietDanger}
              >
                ล้างทั้งหมด
              </button>
            ) : null
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {CANONICAL_ARCHETYPES.map((arch) => {
            const selected = (draft.preferredArchetypes ?? []).includes(arch.id);
            return (
              <button
                key={arch.id}
                type="button"
                aria-pressed={selected}
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
                className={`${toggleChip(selected)} py-1.5`}
              >
                <span aria-hidden="true">{selected ? "✓" : "+"}</span>
                <span>{arch.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 5. Technical skills */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="ทักษะและเทคโนโลยี"
          sub="เลือกเทคโนโลยีที่คุณเชี่ยวชาญเพื่อใช้จับคู่งานจัดซื้อจัดจ้างภาครัฐ"
          right={
            draft.skills.length > 0 ? (
              <button type="button" onClick={() => setClearConfirmTarget("skills")} className={pbtn.quietDanger}>
                ล้างทั้งหมด
              </button>
            ) : null
          }
        />

        {/* Selected skills */}
        {draft.skills.length > 0 && (
          <Inset className="mt-4 p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="font-semibold text-ink">ทักษะที่คุณเลือกแล้ว ({draft.skills.length})</span>
              <span className="text-[11px] text-ink-3">คลิกแท็กเพื่อนำออก</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {visibleSelectedSkills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => handleToggleSkill(skill)}
                  aria-label={`นำ ${skill} ออก`}
                  className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink bg-ink py-1 pl-3 pr-2 text-[11.5px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600"
                >
                  <span>{skill}</span>
                  <span aria-hidden="true" className="opacity-70 group-hover:opacity-100">✕</span>
                </button>
              ))}
            </div>

            {draft.skills.length > 12 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsSkillsSelectedExpanded(!isSkillsSelectedExpanded)}
                  className={pbtn.quiet}
                >
                  {isSkillsSelectedExpanded ? "ย่อลง ▴" : "ดูทั้งหมด ▾"}
                </button>
              </div>
            )}
          </Inset>
        )}

        {/* Search & request technology */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <input
              type="text"
              value={searchSkill}
              onChange={(e) => setSearchSkill(e.target.value)}
              onFocus={() => setIsSkillSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSkillSearchFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (skillSuggestions.length > 0) {
                    handleToggleSkill(skillSuggestions[0]);
                    setSearchSkill("");
                  } else if (searchSkill.trim()) {
                    openRequestModal(searchSkill.trim());
                  }
                } else if (e.key === "Escape") {
                  setIsSkillSearchFocused(false);
                }
              }}
              placeholder="ค้นหาเทคโนโลยี (เช่น React, Python, Docker, PostgreSQL)..."
              aria-label="ค้นหาเทคโนโลยี"
              className={`${field} rounded-full px-4 text-[12px]`}
            />

            {isSkillSearchFocused && searchSkill.trim().length > 0 && (
              <SuggestionList
                items={skillSuggestions}
                isOn={(s) => draft.skills.includes(s)}
                onPick={(s) => {
                  handleToggleSkill(s);
                  setSearchSkill("");
                }}
                requestTerm={!hasExactSkillMatch ? searchSkill.trim() : undefined}
                onRequestTerm={(term) => openRequestModal(term)}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => openRequestModal(searchSkill.trim())}
            className={`${pbtn.secondary} h-9 shrink-0 px-3.5 text-[12px]`}
          >
            + ขอเพิ่มเทคโนโลยี
          </button>
        </div>

        {/* Category tabs & skill bank */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2/70 p-1">
            {TECH_CATEGORY_GROUPS.map((grp) => {
              const active = selectedTechCategory === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedTechCategory(grp.id)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                    active ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {grp.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex max-h-60 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {visibleSkills.map((skill) => {
              const on = draft.skills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  aria-pressed={on}
                  onClick={() => handleToggleSkill(skill)}
                  className={toggleChip(on, "sm")}
                >
                  <span aria-hidden="true">{on ? "✓" : "+"}</span>
                  <span>{skill}</span>
                </button>
              );
            })}
          </div>

          {selectedTechCategory === "all" && categoryFilteredSkills.length > COLLAPSED_SKILLS_LIMIT && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setIsSkillsBankExpanded(!isSkillsBankExpanded)}
                className={pbtn.quiet}
              >
                {isSkillsBankExpanded ? "ย่อรายการทักษะ ▴" : `แสดงรายการทักษะทั้งหมด (${displaySkills.length}) ▾`}
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* 6. Certifications */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="ใบรับรองและมาตรฐาน"
          sub="ใบรับรองมาตรฐานสากล เช่น ISO 29110, ISO 27001, CMMI"
          right={
            draft.certifications.length > 0 ? (
              <button
                type="button"
                onClick={() => setClearConfirmTarget("certifications")}
                className={pbtn.quietDanger}
              >
                ล้างทั้งหมด
              </button>
            ) : null
          }
        />

        {/* Selected certs */}
        {draft.certifications.length > 0 && (
          <Inset className="mt-4 p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
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
                  aria-label={`นำ ${cert} ออก`}
                  className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink bg-ink py-1 pl-3 pr-2 text-[11.5px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600"
                >
                  <span>{cert}</span>
                  <span aria-hidden="true" className="opacity-70 group-hover:opacity-100">✕</span>
                </button>
              ))}
            </div>

            {draft.certifications.length > 8 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsCertsSelectedExpanded(!isCertsSelectedExpanded)}
                  className={pbtn.quiet}
                >
                  {isCertsSelectedExpanded ? "ย่อลง ▴" : "ดูทั้งหมด ▾"}
                </button>
              </div>
            )}
          </Inset>
        )}

        {/* Search & request cert */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <input
              type="text"
              value={searchCert}
              onChange={(e) => setSearchCert(e.target.value)}
              onFocus={() => setIsCertSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsCertSearchFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (certSuggestions.length > 0) {
                    handleToggleCert(certSuggestions[0]);
                    setSearchCert("");
                  } else if (searchCert.trim()) {
                    openRequestModal(searchCert.trim(), "certification");
                  }
                } else if (e.key === "Escape") {
                  setIsCertSearchFocused(false);
                }
              }}
              placeholder="ค้นหามาตรฐาน (เช่น ISO 29110, ISO 27001, CMMI)..."
              aria-label="ค้นหามาตรฐาน"
              className={`${field} rounded-full px-4 text-[12px]`}
            />

            {isCertSearchFocused && searchCert.trim().length > 0 && (
              <SuggestionList
                items={certSuggestions}
                isOn={(c) => draft.certifications.includes(c)}
                onPick={(c) => {
                  handleToggleCert(c);
                  setSearchCert("");
                }}
                requestTerm={!hasExactCertMatch ? searchCert.trim() : undefined}
                onRequestTerm={(term) => openRequestModal(term, "certification")}
                emptyNoun="รายการมาตรฐาน"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => openRequestModal(searchCert.trim(), "certification")}
            className={`${pbtn.secondary} h-9 shrink-0 px-3.5 text-[12px]`}
          >
            + ขอเพิ่มมาตรฐาน
          </button>
        </div>

        {/* Category groups */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CERTIFICATION_CATEGORIES.map((cat) => (
            <Inset key={cat.key} className="p-3.5">
              <h3 className="mb-2.5 text-[12px] font-semibold text-ink">{cat.title}</h3>
              <div className="flex flex-wrap gap-1.5">
                {cat.items.map((item) => {
                  const on = draft.certifications.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={on}
                      onClick={() => handleToggleCert(item)}
                      className={`${toggleChip(on, "sm")} ${on ? "" : "bg-surface"}`}
                    >
                      <span aria-hidden="true">{on ? "✓" : "+"}</span>
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </Inset>
          ))}
        </div>
      </Card>

      {/* 7. Notification preferences */}
      <Card id="notification-settings" className="scroll-mt-24 p-5 sm:p-6">
        <CardHeader
          title="การตั้งค่าการแจ้งเตือน"
          sub="จัดการช่องทางและเกณฑ์การแจ้งเตือนโครงการที่เหมาะสมกับคุณ"
        />

        <div className="mt-4 flex flex-col gap-3">
          {/* Master consent & delivery channels */}
          <Inset className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="master-notification-consent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-ink"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="master-notification-consent"
                  className="block cursor-pointer select-none text-[13px] font-semibold text-ink"
                >
                  ต้องการรับการแจ้งเตือนจากระบบ
                </label>
                <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                  เปิดรับการแจ้งเตือนโครงการจัดซื้อจัดจ้างภาครัฐที่เหมาะสมกับโปรไฟล์และการอัปเดตประกาศจากระบบ GIPDP (ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล PDPA)
                </p>
              </div>
            </div>

            {consent && (
              <div className="mt-4 flex flex-col gap-2.5 sm:pl-7">
                {/* Channel 1: in-app */}
                <Tile className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="channel-in-app"
                    checked={consent}
                    disabled
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-default rounded border-line accent-ink"
                  />
                  <label htmlFor="channel-in-app" className="select-none text-[12.5px] leading-thai text-ink">
                    <span className="font-medium text-ink">แจ้งเตือนในระบบ</span>
                    <span className="ml-2 text-[11px] font-normal text-open">เปิดใช้งานตามสิทธิ์ระบบ</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      แสดงการแจ้งเตือนในกล่องข้อความและไอคอนกระดิ่งบนเว็บไซต์ (โครงการที่เหมาะสมกับโปรไฟล์, สถานะเปลี่ยนแปลง, แก้ไข TOR, และเตือนใกล้หมดเขต)
                    </span>
                  </label>
                </Tile>

                {/* Channel 2: email digest */}
                <Tile className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="channel-email-digest"
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
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-ink"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="channel-email-digest"
                      className="block cursor-pointer select-none text-[12.5px] font-medium leading-thai text-ink"
                    >
                      ส่งสรุปทางอีเมล
                    </label>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      ส่งสรุปโครงการและอัปเดตใหม่ไปยัง <span className="text-ink-2">{user.email}</span>
                    </span>

                    {draft.matchNotification?.enabled && (
                      <fieldset className="mt-3">
                        <legend className="sr-only">ความถี่ของอีเมลสรุป</legend>
                        <div className="inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1">
                          {[
                            { id: "daily", label: "สรุปรายวัน (08:00 น.)" },
                            { id: "weekly", label: "สรุปรายสัปดาห์ (วันจันทร์)" },
                          ].map((freq) => {
                            const checked =
                              (draft.matchNotification?.frequency ?? "daily") === freq.id ||
                              (draft.matchNotification?.frequency === "instant" && freq.id === "daily");
                            return (
                              <label
                                key={freq.id}
                                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(color:--focus) ${
                                  checked ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="notif-frequency"
                                  checked={checked}
                                  onChange={() => {
                                    setDraft((prev) => ({
                                      ...prev,
                                      matchNotification: {
                                        enabled: true,
                                        minScore: prev.matchNotification?.minScore ?? 75,
                                        frequency: freq.id as "daily" | "weekly",
                                        includeSubcontract: prev.matchNotification?.includeSubcontract ?? true,
                                      },
                                    }));
                                  }}
                                  className="sr-only"
                                />
                                <span>{freq.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                  </div>
                </Tile>
              </div>
            )}
          </Inset>

          {!consent ? (
            <div className="rounded-xl border border-dashed border-line-2 px-4 py-5 text-center">
              <p className="mx-auto max-w-xl text-[12px] leading-thai text-ink-3">
                ปิดรับการแจ้งเตือนอยู่ — เปิดตัวเลือก &quot;ต้องการรับการแจ้งเตือนจากระบบ&quot; ด้านบนเพื่อตั้งค่าการแจ้งเตือนโครงการที่เหมาะสมกับโปรไฟล์และรายการติดตามของคุณ
              </p>
            </div>
          ) : (
            <Inset className="p-4 sm:p-5">
              <h3 className="text-[13px] font-semibold text-ink">เกณฑ์และเงื่อนไขการแจ้งเตือน</h3>
              <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                กำหนดเกณฑ์คะแนนความเหมาะสมสำหรับประกาศใหม่ และระยะเวลาแจ้งเตือนล่วงหน้าสำหรับโครงการในรายการติดตาม
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
                {/* Criterion 1: match threshold */}
                <Tile className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <label htmlFor="match-threshold" className="text-[12.5px] font-semibold text-ink">
                      เกณฑ์คะแนนความเหมาะสมขั้นต่ำ
                    </label>
                    <span className="tnum rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">
                      {draft.matchNotification?.minScore ?? 75}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                    แจ้งเตือนเมื่อพบโครงการใหม่ที่มีคะแนนความเหมาะสมกับโปรไฟล์ของคุณถึงเกณฑ์ที่กำหนด
                  </p>
                  <input
                    id="match-threshold"
                    type="range"
                    min={50}
                    max={95}
                    step={5}
                    value={draft.matchNotification?.minScore ?? 75}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        matchNotification: {
                          enabled: prev.matchNotification?.enabled ?? false,
                          minScore: val,
                          frequency: prev.matchNotification?.frequency ?? "daily",
                          includeSubcontract: prev.matchNotification?.includeSubcontract ?? true,
                        },
                      }));
                    }}
                    className="mt-3 h-1.5 w-full max-w-sm cursor-pointer accent-ink"
                  />
                </Tile>

                {/* Criterion 2: subcontract / JV (decision 0033) */}
                <Tile className="flex items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    id="criterion-include-subcontract"
                    checked={draft.matchNotification?.includeSubcontract ?? true}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        matchNotification: {
                          enabled: prev.matchNotification?.enabled ?? false,
                          minScore: prev.matchNotification?.minScore ?? 75,
                          frequency: prev.matchNotification?.frequency ?? "daily",
                          includeSubcontract: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-ink"
                  />
                  <label
                    htmlFor="criterion-include-subcontract"
                    className="cursor-pointer select-none text-[12.5px] leading-thai text-ink"
                  >
                    <span className="block font-semibold text-ink">
                      แนะนำโครงการสำหรับรับงานช่วงหรือกิจการร่วมค้า (Subcontract / JV)
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      รวมโครงการที่ตรงกับทักษะของคุณ แม้ TOR จะกำหนดคุณสมบัติเฉพาะนิติบุคคล (แนะนำสำหรับบุคคลธรรมดา/ฟรีแลนซ์ เพื่อไม่พลาดโอกาสร่วมงานหรือรับงานช่วง)
                    </span>
                  </label>
                </Tile>

                {/* Criterion 3: deadline advance warning */}
                <Tile className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <label htmlFor="deadline-notice" className="text-[12.5px] font-semibold text-ink">
                      แจ้งเตือนล่วงหน้าก่อนปิดรับข้อเสนอ
                    </label>
                    <span className="tnum rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">
                      {draft.deadlineNoticeDays ?? 3} วัน
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                    กำหนดจำนวนวันล่วงหน้าก่อนสิ้นสุดกำหนดยื่นข้อเสนอสำหรับโครงการในรายการติดตาม (Watchlist)
                  </p>
                  <input
                    id="deadline-notice"
                    type="range"
                    min={1}
                    max={30}
                    step={1}
                    value={draft.deadlineNoticeDays ?? 3}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        deadlineNoticeDays: val,
                      }));
                    }}
                    className="mt-3 h-1.5 w-full max-w-sm cursor-pointer accent-ink"
                  />
                  <p className="mt-2 text-[11px] leading-thai text-ink-3">
                    * ระบบจะส่งการแจ้งเตือนล่วงหน้า {draft.deadlineNoticeDays ?? 3} วันก่อนปิดรับข้อเสนอ (และแจ้งเตือนรอบสรุป 7 วันสำหรับโครงการระยะยาว)
                  </p>
                </Tile>
              </div>
            </Inset>
          )}
        </div>
      </Card>

      {/* Bottom save / cancel */}
      <div className="flex items-center justify-end gap-2 pt-1">
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
          className={pbtn.secondary}
        >
          ยกเลิก
        </button>
        <button type="submit" disabled={saving || !!budgetError} className={pbtn.primary}>
          {saving ? "กำลังบันทึก…" : "✓ บันทึกข้อมูลโปรไฟล์"}
        </button>
      </div>

      {/* Floating unsaved-changes bar */}
      {isDirty && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur-md"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="truncate text-[12px] font-medium text-ink">
              มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(true)}
              disabled={saving}
              className="cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || !!budgetError}
              className="cursor-pointer rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "กำลังบันทึก…" : "✓ บันทึก"}
            </button>
          </div>
        </aside>
      )}

      {/* Cancel confirmation */}
      {cancelConfirmOpen && (
        <ConfirmDialog
          title="ยกเลิกการแก้ไขข้อมูล?"
          body="คุณมีการเปลี่ยนแปลงข้อมูลโปรไฟล์ที่ยังไม่ได้บันทึก หากยกเลิก ข้อมูลที่แก้ไขไว้จะถูกละทิ้งทั้งหมด"
          dismissLabel="แก้ไขต่อ"
          confirmLabel="ยืนยันยกเลิก"
          onDismiss={() => setCancelConfirmOpen(false)}
          onConfirm={() => {
            setCancelConfirmOpen(false);
            onCancel();
          }}
        />
      )}

      {/* Clear confirmation */}
      {clearConfirmTarget && (
        <ConfirmDialog
          title="ยืนยันการล้างข้อมูล"
          body={`คุณต้องการลบรายการ${clearConfirmTarget === "skills" ? "ทักษะทั้งหมด" : "ใบรับรองทั้งหมด"}ที่เลือกไว้ออกใช่หรือไม่?`}
          dismissLabel="ยกเลิก"
          confirmLabel="ยืนยันการล้าง"
          onDismiss={() => setClearConfirmTarget(null)}
          onConfirm={() => {
            if (clearConfirmTarget === "skills") {
              setDraft((prev) => ({ ...prev, skills: [] }));
            } else {
              setDraft((prev) => ({ ...prev, certifications: [] }));
            }
            setClearConfirmTarget(null);
          }}
        />
      )}
    </form>

    {isRequestModalOpen && (
      <RequestTechnologyModal
        type={requestType}
        name={requestName}
        category={requestCategory}
        reason={requestReason}
        submitting={requestSubmitting}
        status={requestStatus}
        onChangeName={setRequestName}
        onChangeCategory={setRequestCategory}
        onChangeReason={setRequestReason}
        onDismiss={() => setIsRequestModalOpen(false)}
        onSubmit={handleRequestSubmit}
      />
    )}
    </>
  );
}

function SuggestionList({
  items,
  isOn,
  onPick,
  requestTerm,
  onRequestTerm,
  emptyNoun = "คลังเทคโนโลยี",
}: {
  items: string[];
  isOn: (item: string) => boolean;
  onPick: (item: string) => void;
  requestTerm?: string;
  onRequestTerm?: (term: string) => void;
  emptyNoun?: string;
}) {
  if (items.length === 0 && !requestTerm) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
      {items.length > 0 ? (
        <ul>
          {items.map((item) => {
            const on = isOn(item);
            return (
              <li key={item}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(item);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[12px] hover:bg-surface-2"
                >
                  <span className={on ? "font-semibold text-ink" : "text-ink-2"}>{item}</span>
                  <span className={`shrink-0 text-[10.5px] ${on ? "font-semibold text-open" : "text-ink-3"}`}>
                    {on ? "✓ เลือกแล้ว" : "+ เพิ่ม"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3 py-2 text-[12px] text-ink-3">
          ไม่พบ &ldquo;{requestTerm}&rdquo; ใน{emptyNoun}
        </p>
      )}

      {requestTerm && onRequestTerm && (
        <div className={items.length > 0 ? "mt-1 border-t border-line pt-1" : "pt-0.5"}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onRequestTerm(requestTerm);
            }}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-surface-3"
          >
            <span className="truncate">ขอเพิ่ม &ldquo;{requestTerm}&rdquo; ไปยังผู้ดูแลระบบ</span>
            <span className="shrink-0 text-[11px] text-ink-3">↗</span>
          </button>
        </div>
      )}
    </div>
  );
}

function RequestTechnologyModal({
  type,
  name,
  category,
  reason,
  submitting,
  status,
  onChangeName,
  onChangeCategory,
  onChangeReason,
  onDismiss,
  onSubmit,
}: {
  type: "technology" | "certification";
  name: string;
  category: string;
  reason: string;
  submitting: boolean;
  status: { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string };
  onChangeName: (v: string) => void;
  onChangeCategory: (v: string) => void;
  onChangeReason: (v: string) => void;
  onDismiss: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const isCert = type === "certification";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-tech-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="request-tech-title" className="text-[16px] font-semibold text-ink">
              {isCert ? "ขอเพิ่มใบรับรองหรือมาตรฐานเข้าคลังระบบ" : "ขอเพิ่มเทคโนโลยีเข้าคลังระบบ"}
            </h3>
            <p className="mt-1 text-[12px] leading-thai text-ink-3">
              {isCert
                ? "ส่งคำขอเพิ่มใบรับรองหรือมาตรฐานสากลใหม่ให้ผู้ดูแลระบบตรวจสอบ"
                : "ส่งคำขอเพิ่มเครื่องมือ เฟรมเวิร์ก หรือเทคโนโลยีใหม่ให้ผู้ดูแลระบบตรวจสอบ"}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="ปิดหน้าต่าง"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[16px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-tech-name">
              {isCert ? "ชื่อใบรับรอง / มาตรฐาน" : "ชื่อเทคโนโลยี"}
            </Label>
            <input
              id="request-tech-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder={
                isCert
                  ? "เช่น ISO/IEC 42001, CMMI Level 4, SOC 2 Type II"
                  : "เช่น Next.js, Go, Apache Kafka, Fortinet"
              }
              className={field}
            />
          </div>

          {!isCert && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-tech-category">หมวดหมู่ที่เกี่ยวข้อง</Label>
              <select
                id="request-tech-category"
                value={category}
                onChange={(e) => onChangeCategory(e.target.value)}
                className={`${field} cursor-pointer`}
              >
                {REQUEST_TECH_CATEGORIES.map((cat) => (
                  <option key={cat.value || "none"} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-tech-reason">รายละเอียดเพิ่มเติมหรือลิงก์อ้างอิง (ถ้ามี)</Label>
            <textarea
              id="request-tech-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => onChangeReason(e.target.value)}
              placeholder="ระบุรายละเอียดการใช้งานหรือลิงก์เว็บไซต์ทางการ เพื่อช่วยให้ผู้ดูแลตรวจสอบได้เร็วขึ้น"
              className="w-full rounded-xl border border-line-2 bg-surface p-3 text-[13px] leading-relaxed text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none resize-y"
            />
          </div>

          {status.kind === "success" && (
            <p
              role="status"
              className="rounded-xl border border-open-line bg-open-bg px-3.5 py-2.5 text-[12px] font-medium text-open"
            >
              ✓ {status.message}
            </p>
          )}
          {status.kind === "error" && (
            <p
              role="alert"
              className="rounded-xl border border-risk-line bg-risk-bg px-3.5 py-2.5 text-[12px] text-risk"
            >
              {status.message}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" onClick={onDismiss} disabled={submitting} className={pbtn.secondary}>
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || status.kind === "success"}
              className={pbtn.primary}
            >
              {submitting
                ? "กำลังส่งคำขอ…"
                : isCert
                ? "ส่งคำขอเพิ่มมาตรฐาน"
                : "ส่งคำขอเพิ่มเทคโนโลยี"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  dismissLabel,
  confirmLabel,
  onDismiss,
  onConfirm,
}: {
  title: string;
  body: string;
  dismissLabel: string;
  confirmLabel: string;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="profile-confirm-title" className="text-[15px] font-semibold text-ink">
          {title}
        </h3>
        <p className="mt-2 text-[12.5px] leading-thai text-ink-2">{body}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onDismiss} className={pbtn.secondary}>
            {dismissLabel}
          </button>
          <button type="button" onClick={onConfirm} className={pbtn.danger}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
