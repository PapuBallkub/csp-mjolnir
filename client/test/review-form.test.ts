import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildApprovePayload,
  computeReviewDiffs,
  createEmptyReviewFormState,
  itemToReviewFormState,
  parseIntegerInput,
  parseNumberInput,
  revertReviewField,
  toDateInputValue,
  validateReviewForm,
  type ReviewItemData,
} from "../app/(app)/admin/review/[id]/_lib/review-form.ts";

function makeSampleItem(overrides: Partial<ReviewItemData> = {}): ReviewItemData {
  return {
    docId: "68079090953",
    title: "โครงการพัฒนาแพลตฟอร์มข้อมูลเมือง",
    agency: "เทศบาลเมืองลัดหลวง",
    ingestedAt: "2026-10-27",
    ocr: 0.92,
    extraction: 0.9,
    reviewStatus: "pending",
    lowFields: [],
    budgetTHB: 1800000,
    referencePriceTHB: 1750000,
    submissionDeadline: "2026-11-15T09:00:00.000Z",
    details: {
      titleEn: "Smart City Data Platform",
      department: "สำนักปลัด",
      categories: ["Software", "Data & AI"],
      status: "Open",
      commentDeadline: "2026-11-01",
      postedDate: "2026-10-27",
      deliveryPeriodDays: 120,
      contractDurationDays: 180,
      warrantyYears: 2,
      procurementMethod: "e-bidding",
      penaltyClause: "ร้อยละ 0.20 ต่อวัน",
      objective: "พัฒนาระบบสารสนเทศกลาง",
      systemArchetype: "Web Application",
      complexityTier: "Tier 2 - Moderate / Mid-Range",
      highLevelScope: "ออกแบบและพัฒนาเว็บแอปพลิเคชัน",
      majorComponents: ["Core API", "Admin Portal"],
      deliverables: {
        system: ["ซอร์สโค้ดระบบ"],
        implementation: ["ติดตั้งระบบบน GDCC"],
        validation: ["รายงานทดสอบ UAT"],
        supportingWork: ["คู่มือการใช้งาน"],
      },
      technologiesList: [
        { name: "PostgreSQL", version: "16" },
        { name: "Docker" },
      ],
      requiredCapabilities: ["รองรับ 1,000 concurrent users"],
      infrastructureSpecifications: [{ item: "CPU", specification: "16 vCPU" }],
      technicalConstraints: [{ metric: "Uptime", value: "99.9%" }],
      integrationEnvironment: {
        existingSystems: ["ระบบสารบรรณเดิม"],
        interfacesAndApis: ["REST API"],
        dataMigrationNotes: "ย้ายข้อมูล CSV จากระบบเก่า",
        deploymentLocation: "GDCC",
      },
      operationalRequirements: {
        installationAndConfig: ["ตั้งค่า Firewall"],
        training: ["อบรมผู้ดูแล 1 รุ่น"],
        technicalSupportAndSla: "ตอบสนองภายใน 2 ชั่วโมง",
        maintenance: ["PM ทุก 3 เดือน"],
      },
      companyRequirements: ["- จดทะเบียนนิติบุคคล\n* ทุนจดทะเบียนไม่น้อยกว่า 1 ล้านบาท"],
      requiredCertifications: ["ISO/IEC 29110"],
      manufacturerAuthorizations: ["หนังสือแต่งตั้งตัวแทน"],
      personnelQualifications: ["PM มีประสบการณ์ 5 ปี"],
      previousExperience: "มีผลงานระบบฐานข้อมูลภาครัฐ",
      previousExperienceMinTHB: 900000,
      paymentTerms: "แบ่งจ่าย 3 งวด",
      deliveryConditions: "ตรวจรับภายใน 5 วันทำการ",
      evaluationMethod: "เกณฑ์ราคา",
      amendmentInfo: {
        isAmended: false,
        amendmentSummary: "",
        changedSections: [],
      },
      version: 1,
    },
    ...overrides,
  };
}

test("parseNumberInput and parseIntegerInput handle empty, commas, decimals, negatives, and invalid text", () => {
  assert.deepEqual(parseNumberInput(""), { valid: true, value: null });
  assert.deepEqual(parseNumberInput("  "), { valid: true, value: null });
  assert.deepEqual(parseNumberInput("1,800,000.50"), { valid: true, value: 1800000.5 });
  assert.equal(parseNumberInput("-500").valid, false);
  assert.equal(parseNumberInput("12abc").valid, false);

  assert.deepEqual(parseIntegerInput(""), { valid: true, value: null });
  assert.deepEqual(parseIntegerInput("1,200"), { valid: true, value: 1200 });
  assert.equal(parseIntegerInput("1.5").valid, false);
  assert.equal(parseIntegerInput("-10").valid, false);
});

test("toDateInputValue converts UTC ISO timestamps to Bangkok calendar date and preserves plain dates", () => {
  // 2026-11-15T18:00:00Z is 2026-11-16 01:00 in Bangkok (UTC+7)
  assert.equal(toDateInputValue("2026-11-15T18:00:00.000Z"), "2026-11-16");
  assert.equal(toDateInputValue("2026-11-01"), "2026-11-01");
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue(undefined), "");
});

test("itemToReviewFormState normalizes technologiesList, fallback requiredTechnologies, and multiline companyRequirements", () => {
  const state = itemToReviewFormState(makeSampleItem());
  assert.deepEqual(state.selectedTechs, ["PostgreSQL", "Docker"]);
  assert.deepEqual(state.techVersions, { PostgreSQL: "16" });
  assert.deepEqual(state.infrastructureSpecs, [{ key: "CPU", value: "16 vCPU" }]);
  assert.deepEqual(state.technicalConstraints, [{ key: "Uptime", value: "99.9%" }]);
  assert.deepEqual(state.companyReqs, ["- จดทะเบียนนิติบุคคล\n* ทุนจดทะเบียนไม่น้อยกว่า 1 ล้านบาท"]);

  // Fallback when technologiesList is absent and companyRequirements is a bulleted string
  const fallbackItem = makeSampleItem({
    details: {
      requiredTechnologies: "Linux, NGINX Plus, Docker",
      companyRequirements: "- นิติบุคคลไทย\n* ไม่ติดแบล็กลิสต์" as unknown as string[],
    },
  });
  const fallbackState = itemToReviewFormState(fallbackItem);
  assert.deepEqual(fallbackState.selectedTechs, ["Linux", "NGINX Plus", "Docker"]);
  assert.deepEqual(fallbackState.techVersions, {});
  assert.deepEqual(fallbackState.companyReqs, ["นิติบุคคลไทย", "ไม่ติดแบล็กลิสต์"]);
});

test("validateReviewForm catches invalid numeric fields with exact Thai messages", () => {
  const base = createEmptyReviewFormState();
  assert.equal(validateReviewForm(base).hasErrors, false);

  const badRef = validateReviewForm({ ...base, referencePriceTHB: "abc" });
  assert.equal(badRef.hasErrors, true);
  assert.match(badRef.firstErrorMessage ?? "", /ราคากลาง/);

  const badDuration = validateReviewForm({ ...base, contractDurationDays: "30.5" });
  assert.equal(badDuration.hasErrors, true);
  assert.match(badDuration.firstErrorMessage ?? "", /ระยะเวลาสัญญา/);
});

test("computeReviewDiffs detects real edits and ignores formatting-only comma changes", () => {
  const initial = itemToReviewFormState(makeSampleItem());

  // Unchanged or comma-formatted numbers -> 0 diffs
  assert.equal(computeReviewDiffs(initial, initial).length, 0);
  const commaFormatted = { ...initial, budgetTHB: "1,800,000", referencePriceTHB: "1,750,000" };
  assert.equal(computeReviewDiffs(initial, commaFormatted).length, 0);

  // Real edits across multiple sections
  const edited = {
    ...initial,
    title: "โครงการใหม่",
    budgetTHB: "2,000,000",
    deliverablesSystem: ["ซอร์สโค้ดระบบ", "API Docs"],
    infrastructureSpecs: [{ key: "CPU", value: "32 vCPU" }],
    isAmended: true,
  };
  const diffs = computeReviewDiffs(initial, edited);
  assert.deepEqual(
    diffs.map((d) => d.field),
    ["title", "budgetTHB", "deliverables.system", "infrastructureSpecifications", "isAmended"]
  );
  assert.equal(diffs[1]?.from, "1800000");
  assert.equal(diffs[1]?.to, "2000000");
  assert.equal(diffs[4]?.from, "No");
  assert.equal(diffs[4]?.to, "Yes");
});

test("revertReviewField restores scalars, lists, key-values, and tech stack with versions", () => {
  const initial = itemToReviewFormState(makeSampleItem());
  const edited = {
    ...initial,
    title: "แก้ชื่อ",
    deliverablesSystem: ["แก้ไข"],
    selectedTechs: ["Node.js"],
    techVersions: { "Node.js": "20" },
    infrastructureSpecs: [{ key: "RAM", value: "64GB" }],
  };

  let restored = revertReviewField(edited, initial, "title");
  assert.equal(restored.title, initial.title);
  assert.equal(restored.selectedTechs[0], "Node.js");

  restored = revertReviewField(restored, initial, "deliverables.system");
  assert.deepEqual(restored.deliverablesSystem, initial.deliverablesSystem);

  restored = revertReviewField(restored, initial, "requiredTechnologies");
  assert.deepEqual(restored.selectedTechs, ["PostgreSQL", "Docker"]);
  assert.deepEqual(restored.techVersions, { PostgreSQL: "16" });

  restored = revertReviewField(restored, initial, "infrastructureSpecifications");
  assert.deepEqual(restored.infrastructureSpecs, [{ key: "CPU", value: "16 vCPU" }]);

  assert.equal(computeReviewDiffs(initial, restored).length, 0);
});

test("buildApprovePayload trims inputs, drops empty list rows, and formats UpdateReviewPayload", () => {
  const initial = itemToReviewFormState(makeSampleItem());
  const modified = {
    ...initial,
    title: "  โครงการทดสอบ  ",
    titleEn: "   ",
    budgetTHB: "2,100,000",
    majorComponents: ["Module A", ""],
    infrastructureSpecs: [
      { key: "RAM", value: "64GB" },
      { key: "", value: "" },
    ],
  };

  const validation = validateReviewForm(modified);
  const payload = buildApprovePayload(modified, validation);

  assert.equal(payload.action, "approve");
  assert.equal(payload.fields?.title, "โครงการทดสอบ");
  assert.equal(payload.fields?.titleEn, null);
  assert.equal(payload.fields?.budgetTHB, 2100000);
  assert.deepEqual(payload.fields?.majorComponents, ["Module A"]);
  assert.deepEqual(payload.fields?.infrastructureSpecifications, [
    { item: "RAM", specification: "64GB" },
  ]);
  assert.deepEqual(payload.fields?.technologiesList, [
    { name: "PostgreSQL", version: "16" },
    { name: "Docker", version: undefined },
  ]);
});
