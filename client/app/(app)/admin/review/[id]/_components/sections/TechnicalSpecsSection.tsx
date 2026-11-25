import { useState } from "react";
import type { TechnologyItem } from "../../../../../../_lib/api";
import { btn, input, Panel, SectionHeading } from "../../../../../../_components/ui";
import { DynamicListEditor, KeyValueListEditor } from "../../ReviewEditorComponents";
import { FieldHeader, type ReviewSectionBaseProps } from "../ReviewFieldPrimitives";

export function TechnicalSpecsSection({
  form,
  setField,
  diffsByField,
  onRevert,
  availableTechs,
  onToggleTech,
  onRemoveTech,
  onAddCustomTech,
}: Omit<ReviewSectionBaseProps, "getFieldScore"> & {
  availableTechs: TechnologyItem[];
  onToggleTech: (name: string) => void;
  onRemoveTech: (name: string) => void;
  onAddCustomTech: (name: string, version?: string) => void;
}) {
  const [searchTech, setSearchTech] = useState("");
  const [isTechSearchFocused, setIsTechSearchFocused] = useState(false);
  const [customTechInput, setCustomTechInput] = useState("");
  const [customTechVersion, setCustomTechVersion] = useState("");

  const handleAddCustomClick = () => {
    if (!customTechInput.trim()) return;
    onAddCustomTech(customTechInput, customTechVersion);
    setCustomTechInput("");
    setCustomTechVersion("");
  };

  return (
    <Panel id="sec-tech" className="p-5 scroll-mt-[135px]">
      <div className="border-b border-line pb-3">
        <SectionHeading>{"5. ข้อกำหนดด้านเทคโนโลยีและมาตรฐาน"}</SectionHeading>
        <p className="text-[12px] text-ink-3 mt-1">
          {"เทคโนโลยีที่กำหนด คุณลักษณะฮาร์ดแวร์/ซอฟต์แวร์ และเกณฑ์ทางเทคนิค"}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {/* Tech Stack Selector */}
        <div
          className={`rounded-xl transition-colors ${
            diffsByField["requiredTechnologies"]
              ? "p-3 bg-amend-bg/15 border border-amend-line/80"
              : ""
          }`}
        >
          <FieldHeader
            label={"เทคโนโลยีที่กำหนดใน TOR"}
            fieldKey="requiredTechnologies"
            diffItem={diffsByField["requiredTechnologies"]}
            onRevert={onRevert}
          />
          <p className="text-[12px] text-ink-3 mt-0.5">
            {"เลือกจากคลังเทคโนโลยีมาตรฐาน หรือเพิ่มเทคโนโลยีพร้อมระบุเวอร์ชัน"}
          </p>

          {/* Selected Tags */}
          <div className="mt-3 flex flex-wrap gap-2">
            {form.selectedTechs.map((name) => {
              const ver = form.techVersions[name];
              return (
                <div
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-[12px]"
                >
                  <span className="font-medium text-ink">{name}</span>
                  {ver ? (
                    <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-mono text-ink-2">
                      {ver}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveTech(name)}
                    title={"ลบ"}
                    className="text-ink-3 hover:text-risk cursor-pointer ml-1"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Autocomplete Search Bar */}
          <div className="relative mt-3">
            <input
              type="text"
              value={searchTech}
              onFocus={() => setIsTechSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsTechSearchFocused(false), 200)}
              onChange={(e) => setSearchTech(e.target.value)}
              placeholder={"พิมพ์เพื่อค้นหาเทคโนโลยีในคลัง..."}
              className={input}
            />

            {isTechSearchFocused && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
                {availableTechs
                  .filter(
                    (t) =>
                      !searchTech.trim() ||
                      t.name.toLowerCase().includes(searchTech.trim().toLowerCase())
                  )
                  .slice(0, 15)
                  .map((tech) => {
                    const isSelected = form.selectedTechs.includes(tech.name);
                    return (
                      <button
                        key={tech.name}
                        type="button"
                        onMouseDown={() => onToggleTech(tech.name)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-surface-2 cursor-pointer ${
                          isSelected ? "bg-open-bg/40 font-semibold text-open" : "text-ink"
                        }`}
                      >
                        <span>{tech.name}</span>
                        <span className="font-mono text-[10px] text-ink-3 uppercase">{tech.category}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Add Custom Tech with Version */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={customTechInput}
              onChange={(e) => setCustomTechInput(e.target.value)}
              placeholder={"ชื่อเทคโนโลยีเพิ่มเติม..."}
              className={`${input} flex-1 sm:max-w-[200px]`}
            />
            <input
              type="text"
              value={customTechVersion}
              onChange={(e) => setCustomTechVersion(e.target.value)}
              placeholder={"เวอร์ชัน (ถ้ามี) เช่น 2019"}
              className={`${input} flex-1 sm:max-w-[140px]`}
            />
            <button
              type="button"
              onClick={handleAddCustomClick}
              className={`${btn.secondary} text-[12px] h-9 px-3`}
            >
              {"+ เพิ่มเทคโนโลยีนี้"}
            </button>
          </div>
        </div>

        <DynamicListEditor
          label={"สมรรถนะและความสามารถทางเทคนิคที่ต้องมี"}
          items={form.requiredCapabilities}
          onChange={(next) => setField("requiredCapabilities", next)}
          placeholder={"เช่น รองรับการเชื่อมต่อพร้อมกันไม่น้อยกว่า 1,000 คน (Concurrent Users)"}
          addLabel={"เพิ่มสมรรถนะเทคนิค"}
          isModified={Boolean(diffsByField["requiredCapabilities"])}
          onRevert={() => onRevert("requiredCapabilities")}
        />

        <KeyValueListEditor
          label={"คุณลักษณะเฉพาะด้านโครงสร้างพื้นฐาน"}
          items={form.infrastructureSpecs}
          onChange={(next) => setField("infrastructureSpecs", next)}
          keyLabel={"รายการ / ฮาร์ดแวร์"}
          valueLabel={"คุณลักษณะที่กำหนด (Spec)"}
          addLabel={"เพิ่มคุณลักษณะอุปกรณ์"}
          isModified={Boolean(diffsByField["infrastructureSpecifications"])}
          onRevert={() => onRevert("infrastructureSpecifications")}
        />

        <KeyValueListEditor
          label={"ข้อจำกัดและตัวชี้วัดทางเทคนิค"}
          items={form.technicalConstraints}
          onChange={(next) => setField("technicalConstraints", next)}
          keyLabel={"ตัวชี้วัด (Metric)"}
          valueLabel={"เกณฑ์ที่กำหนด (Target Value)"}
          addLabel={"เพิ่มเกณฑ์ทางเทคนิค"}
          isModified={Boolean(diffsByField["technicalConstraints"])}
          onRevert={() => onRevert("technicalConstraints")}
        />
      </div>
    </Panel>
  );
}
