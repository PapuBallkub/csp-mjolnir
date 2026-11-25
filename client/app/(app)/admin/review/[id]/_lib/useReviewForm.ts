"use client";

import { useCallback, useMemo, useState } from "react";
import type { EditDiffItem } from "../ReviewEditorComponents";
import {
  computeReviewDiffs,
  createEmptyReviewFormState,
  itemToReviewFormState,
  revertReviewField,
  type ReviewFormState,
  type ReviewItemData,
  validateReviewForm,
} from "./review-form";

export function useReviewForm() {
  const [initialForm, setInitialForm] = useState<ReviewFormState>(() => createEmptyReviewFormState());
  const [form, setForm] = useState<ReviewFormState>(() => createEmptyReviewFormState());

  const resetFromItem = useCallback((item: ReviewItemData) => {
    const next = itemToReviewFormState(item);
    setInitialForm(next);
    setForm(next);
  }, []);

  const setField = useCallback(
    <K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleTech = useCallback((name: string) => {
    setForm((prev) => ({
      ...prev,
      selectedTechs: prev.selectedTechs.includes(name)
        ? prev.selectedTechs.filter((t) => t !== name)
        : [...prev.selectedTechs, name],
    }));
  }, []);

  const removeTech = useCallback((name: string) => {
    setForm((prev) => {
      const nextVersions = { ...prev.techVersions };
      delete nextVersions[name];
      return {
        ...prev,
        selectedTechs: prev.selectedTechs.filter((t) => t !== name),
        techVersions: nextVersions,
      };
    });
  }, []);

  const addCustomTech = useCallback((rawName: string, rawVersion?: string) => {
    const name = rawName.trim();
    if (!name) return;
    const version = rawVersion?.trim() ?? "";
    setForm((prev) => {
      if (prev.selectedTechs.some((t) => t.toLowerCase() === name.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        selectedTechs: [...prev.selectedTechs, name],
        techVersions: version
          ? { ...prev.techVersions, [name]: version }
          : prev.techVersions,
      };
    });
  }, []);

  const validation = useMemo(() => validateReviewForm(form), [form]);

  const diffs = useMemo<EditDiffItem[]>(
    () => computeReviewDiffs(initialForm, form, validation),
    [initialForm, form, validation]
  );

  const diffsByField = useMemo(() => {
    const map: Record<string, EditDiffItem> = {};
    for (const d of diffs) {
      map[d.field] = d;
    }
    return map;
  }, [diffs]);

  const diffsBySection = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of diffs) {
      map[d.section] = (map[d.section] || 0) + 1;
    }
    return map;
  }, [diffs]);

  const revertField = useCallback(
    (fieldKey: string) => {
      setForm((prev) => revertReviewField(prev, initialForm, fieldKey));
    },
    [initialForm]
  );

  const discardAll = useCallback(() => {
    setForm(initialForm);
  }, [initialForm]);

  return {
    form,
    setField,
    resetFromItem,
    validation,
    diffs,
    diffsByField,
    diffsBySection,
    revertField,
    discardAll,
    toggleTech,
    removeTech,
    addCustomTech,
  };
}
