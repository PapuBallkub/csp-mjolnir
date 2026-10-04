import type { Profile } from "../_data/tors";
import type { TorInsightSummary } from "./api";

export type Match = {
  /** 0–100 */
  score: number;
  /** The TOR's technologies the profile already lists */
  matched: string[];
};

/**
 * FR-13, kept legible: two things the user can see and change on /profile.
 * Skills carry most of the weight, the budget range the rest. A TOR that
 * names no price gets half the budget credit: unknown, so neither rewarded
 * nor punished.
 *
 * Scored in the browser for now, over what the API returns, because the
 * profile itself still lives in the browser. It moves to the API with it.
 */
export function matchFor(tor: TorInsightSummary, profile: Profile): Match {
  const skills = new Set(profile.skills.map((skill) => skill.toLowerCase()));
  const required = [...new Set((tor.technicalRequirements?.requiredTechnologies ?? []).map((t) => t.name))];
  const matched = required.filter((name) => skills.has(name.toLowerCase()));

  const price = tor.facts.referencePriceTHB ?? tor.facts.budgetTHB;
  const budgetFit =
    price === null ? 0.5 : price >= profile.budgetMin && price <= profile.budgetMax ? 1 : 0.15;
  const skillFit = required.length ? matched.length / required.length : 0;

  return { score: Math.round(skillFit * 70 + budgetFit * 30), matched };
}
