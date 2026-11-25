"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

  // Whether the account has a local password (false for Google-only accounts)
  const [fetchedHasPassword, setFetchedHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof user.hasPassword === "boolean") return;
    let cancelled = false;
    api.me().then((res) => {
      if (!cancelled) {
        setFetchedHasPassword(res.ok ? res.data.user.hasPassword === true : false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user.hasPassword]);

  const hasPassword =
    typeof user.hasPassword === "boolean" ? user.hasPassword : fetchedHasPassword === true;

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

  const handleTechnologyAdded = useCallback((tech: TechnologyItem) => {
    setTechList((prev) => {
      if (prev.some((t) => t.name.toLowerCase() === tech.name.toLowerCase())) {
        return prev;
      }
      return [...prev, tech].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const handleEnterEdit = useCallback((hash?: string) => {
    if (typeof window !== "undefined") {
      const nextUrl = `/profile?edit=true${hash || ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
    setMode("edit");
  }, []);

  const handleSave = async (
    updatedDraft: UserProfile,
    notificationConsent?: boolean
  ): Promise<ApiError | null> => {
    const error = await updateProfile({
      ...updatedDraft,
      notificationConsent,
    });
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
    deadlineNoticeDays: 3,
  };

  return (
    <div className="mx-auto w-full max-w-[1020px] px-4 py-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold text-ink sm:text-[26px]">
            {mode === "view" ? "โปรไฟล์ความสามารถของฉัน" : "แก้ไขโปรไฟล์ความสามารถ"}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-thai text-ink-2">
            {mode === "view"
              ? "ข้อมูลสำหรับวิเคราะห์ความเหมาะสมกับประกาศจัดซื้อจัดจ้างภาครัฐ (Match Scoring) และแจ้งเตือนโครงการที่เหมาะสม"
              : "ปรับปรุงข้อมูลทักษะ ช่วงงบประมาณ และเกณฑ์คุณสมบัติของคุณ"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {savedSuccess && (
            <div
              role="status"
              className="rounded-full border border-open-line bg-open-bg px-3.5 py-1.5 text-[12px] font-medium text-open"
            >
              ✓ บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว
            </div>
          )}
        </div>
      </header>

      {/* Main View/Edit Modes */}
      {mode === "view" ? (
        <ProfileDisplay
          user={user}
          profile={currentProfile}
          onEdit={() => handleEnterEdit()}
          onEditNotifications={() => handleEnterEdit("#notification-settings")}
        />
      ) : (
        <ProfileEditForm
          user={user}
          hasPassword={hasPassword}
          initialDraft={currentProfile}
          techList={techList}
          techsLoading={techsLoading}
          onTechnologyAdded={handleTechnologyAdded}
          onSave={handleSave}
          onCancel={() => {
            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", "/profile");
            }
            setMode("view");
          }}
        />
      )}
    </div>
  );
}
