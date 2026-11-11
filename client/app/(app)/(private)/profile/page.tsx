"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useAuthedUser } from "../../../_components/auth";
import * as api from "../../../_lib/api";
import type { ApiError, TechnologyItem, UserProfile } from "../../../_lib/api";
import { ProfileDisplay } from "./_components/ProfileDisplay";
import { ProfileEditForm } from "./_components/ProfileEditForm";

export default function ProfilePage() {
  const user = useAuthedUser();
  const { updateProfile } = useAuth();
  const searchParams = useSearchParams();

  // "view" by default, or "edit" if ?edit=true is present
  const [mode, setMode] = useState<"view" | "edit">(() => {
    return searchParams.get("edit") === "true" ? "edit" : "view";
  });

  // Technologies vocabulary loaded from API
  const [techList, setTechList] = useState<TechnologyItem[]>([]);
  const [techsLoading, setTechsLoading] = useState(true);

  // Success message toast
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getTechnologies().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.technologies) {
        setTechList(result.data.technologies);
      } else {
        api.torFacets().then((facetsRes) => {
          if (cancelled) return;
          if (facetsRes.ok) {
            setTechList(facetsRes.data.technologies.map((t) => ({ name: t.name })));
          }
        });
      }
      setTechsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (updatedDraft: UserProfile): Promise<ApiError | null> => {
    const error = await updateProfile(updatedDraft);
    if (!error) {
      setSavedSuccess(true);
      setMode("view");
      setTimeout(() => setSavedSuccess(false), 4000);
      return null;
    }
    return error;
  };

  const currentProfile: UserProfile = user.profile ?? {
    skills: [],
    budgetMin: 0,
    budgetMax: 0,
    certifications: [],
    entityType: "juristic",
    preferredArchetypes: [],
    maxPastPortfolioTHB: 0,
    matchNotification: {
      enabled: false,
      minScore: 75,
      frequency: "daily",
      includeSubcontract: true,
    },
  };

  return (
    <div className="mx-auto max-w-[1020px] px-4 py-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[28px]">
            {mode === "view" ? "โปรไฟล์ความสามารถของฉัน" : "แก้ไขโปรไฟล์ความสามารถ"}
          </h1>
          <p className="mt-1 text-[13.5px] leading-thai text-ink-2">
            {mode === "view"
              ? "ข้อมูลสำหรับวิเคราะห์ความตรงกับประกาศจัดซื้อจัดจ้างภาครัฐ (Match Scoring) และแจ้งเตือนโครงการที่เหมาะสม"
              : "ปรับปรุงข้อมูลทักษะ ช่วงงบประมาณ และเกณฑ์คุณสมบัติของคุณ"}
          </p>
        </div>

        {savedSuccess && (
          <div className="rounded-[3px] border border-open-line bg-open-bg px-3 py-1.5 text-[12.5px] font-medium text-open animate-in fade-in">
            ✓ บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว
          </div>
        )}
      </header>

      {/* Main View/Edit Modes */}
      {mode === "view" ? (
        <ProfileDisplay
          user={user}
          profile={currentProfile}
          onEdit={() => setMode("edit")}
        />
      ) : (
        <ProfileEditForm
          user={user}
          initialDraft={currentProfile}
          techList={techList}
          techsLoading={techsLoading}
          onSave={handleSave}
          onCancel={() => setMode("view")}
        />
      )}
    </div>
  );
}
