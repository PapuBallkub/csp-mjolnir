/**
 * server/src/pipeline/extraction/assemble.js
 *
 * Builds the TorInsight record from the feed and the AI's answers. Pure: the
 * rules for which source wins live here, in one place, and are tested without
 * Gemini or a database.
 *
 * - The feed wins wherever it has a value (D2); the AI fills the gaps.
 * - Evidence (quote, page) is kept only for values the AI supplied.
 * - Status comes from the feed alone; Closed is worked out when read (ADR 0013).
 */

import { egpAnnouncementUrl } from '../shared/egp-links.js';
import { feedAmount, feedDate, toAmount, toDate, toNumber, toText } from './convert.js';

const unique = (items) => [...new Set(items ?? [])];

function sameValue(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1;
  return String(a).trim() === String(b).trim();
}

function identity(tor, agency, extra = {}) {
  if (!tor.title && !extra.titleTh) throw new Error('No title in the feed or the document.');
  if (!agency) throw new Error('No agency in the feed or the document.');
  return {
    titleTh: extra.titleTh ?? tor.title,
    titleEn: null, // Thai only for now (D13)
    agency,
    department: extra.department ?? null,
    egpReference: tor.projectId,
    category: extra.category ?? null,
    // A copy as of now; the API reads the live status from the Tor, since the
    // feed keeps changing it after extraction
    status: tor.status,
  };
}

function runMetadata(run, extra) {
  return {
    modelName: run.model,
    promptVersion: run.promptVersion,
    processedAt: run.now,
    sourceFingerprint: run.fingerprint,
    reviewStatus: 'pending', // every result is reviewed during the pilot
    reviewedBy: null,
    reviewedAt: null,
    ...extra,
  };
}

const links = (tor) => ({ sourceUrl: tor.egpUrl || null, webUrl: egpAnnouncementUrl(tor.projectId) });

/**
 * The full record for a TOR the classify step found to be IT.
 *
 * @param {object} input
 * @param {object} input.tor - The Tor record (feed values, OCR text)
 * @param {object} input.classification - The classify step's answer
 * @param {object} input.extracted - The extract step's answer
 * @param {object[]} input.technologies - Canonical { name, version }, grounded and resolved
 * @param {string[]} input.certifications - Grounded certification names
 * @param {string[]} input.authorizations - Grounded manufacturer authorization names
 * @param {{ checks: object[], score: number }} input.checkResult
 * @param {{ model: string, promptVersion: string, fingerprint: string, now: Date }} input.run
 */
export function buildInsight({ tor, classification, extracted, technologies, certifications, authorizations, checkResult, run }) {
  const ai = extracted;
  const evidence = {};

  // An AI value is used only where the feed has none, and brings its evidence
  const fromAi = (field, given, value) => {
    if (value !== null && value !== undefined && given) evidence[field] = { quote: given.quote, page: given.page ?? null };
    return value ?? null;
  };
  // Where the feed has a value it wins. If the document says the same, the
  // quote still shows where; if it differs, the quote would contradict the
  // stored value, so it's left out (the check has sent the TOR to review)
  const feedFirst = (feedValue, field, given, value) => {
    if (feedValue === null || feedValue === undefined) return fromAi(field, given, value);
    if (sameValue(feedValue, value)) fromAi(field, given, value);
    return feedValue;
  };

  // Title: when feed and document agree, the document's is kept, because the
  // feed wraps it in "ประกวดราคา… ด้วยวิธี… (e-bidding)". When they disagree,
  // the feed's stands and the cross-source check has sent it to review.
  const titleDisagrees = checkResult.checks.some(
    (c) => c.check === 'cross-source' && c.field === 'identification.titleTh',
  );
  const aiTitle = toText(ai.identification?.titleTh);
  const titleTh = aiTitle && (!titleDisagrees || !tor.title) ? aiTitle : tor.title;

  const facts = ai.facts ?? {};
  return {
    projectId: tor.projectId,
    identification: identity(tor, tor.agency || toText(ai.identification?.agency) || classification.agency, {
      titleTh,
      department: ai.identification?.department ?? null,
      category: classification.category ?? null,
    }),
    facts: {
      budgetTHB: feedFirst(feedAmount(tor.budgetTHB), 'budgetTHB', facts.budget, toAmount(facts.budget)),
      referencePriceTHB: feedFirst(
        feedAmount(tor.referencePriceTHB),
        'referencePriceTHB',
        facts.referencePrice,
        toAmount(facts.referencePrice),
      ),
      submissionDeadline: fromAi('submissionDeadline', facts.submissionDeadline, toDate(facts.submissionDeadline)),
      commentDeadline: fromAi('commentDeadline', facts.commentDeadline, toDate(facts.commentDeadline)),
      postedDate: feedFirst(feedDate(tor.announceDate), 'postedDate', facts.postedDate, toDate(facts.postedDate)),
      deliveryPeriodDays: fromAi('deliveryPeriodDays', facts.deliveryPeriodDays, toNumber(facts.deliveryPeriodDays)),
      contractDurationDays: fromAi('contractDurationDays', facts.contractDurationDays, toNumber(facts.contractDurationDays)),
      warrantyYears: fromAi('warrantyYears', facts.warrantyYears, toNumber(facts.warrantyYears)),
      procurementMethod: feedFirst(
        tor.procurementMethod || null,
        'procurementMethod',
        facts.procurementMethod,
        toText(facts.procurementMethod),
      ),
      penaltyClause: fromAi('penaltyClause', facts.penaltyClause, toText(facts.penaltyClause)),
      ...links(tor),
    },
    evidence,
    overview: ai.overview,
    deliverables: ai.deliverables,
    technicalRequirements: { ...ai.technicalRequirements, requiredTechnologies: technologies },
    integrationEnvironment: ai.integrationEnvironment,
    operationalRequirements: ai.operationalRequirements,
    eligibility: {
      ...ai.eligibility,
      standardConditions: unique(ai.eligibility?.standardConditions),
      requiredCertifications: unique(certifications),
      manufacturerAuthorizations: unique(authorizations),
      previousExperienceMinTHB: toAmount(ai.eligibility?.previousExperienceMin),
      previousExperienceMin: undefined, // the evidenced form, not a stored field
    },
    contractConditions: ai.contractConditions,
    amendmentInfo: { isAmended: Boolean(tor.isAmended) },
    metadata: runMetadata(run, {
      confidenceScore: checkResult.score,
      checks: checkResult.checks,
      excluded: null,
    }),
  };
}

/**
 * The minimal record for a TOR the classify step found not to be IT. The full
 * extraction never runs for it (D8); the reason stays for a reviewer to check.
 */
export function buildExcluded({ tor, classification, run }) {
  return {
    projectId: tor.projectId,
    identification: identity(tor, tor.agency || classification.agency),
    facts: links(tor),
    metadata: runMetadata(run, {
      confidenceScore: null,
      checks: [],
      excluded: { reason: classification.reason, quote: classification.quote ?? null },
    }),
  };
}
