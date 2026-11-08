// The kinds of IT project. A TOR records up to MAX_CATEGORIES of them, the main
// kind first (TorInsight.identification.categories, ADR 0034). Price analysis
// uses them to find similar past projects (FR-19) and lock-spec reads the main
// one (FR-21): the AI picks the labels, and code does the comparing.
//
// Shape only: the enum source for the models, kept beside them.

export const PROJECT_CATEGORY_MEANINGS = [
  { key: 'software-development', means: 'building or customizing software, websites or apps' },
  { key: 'systems-integration', means: 'hardware and software delivered and set up as one working system' },
  { key: 'software-licenses', means: 'buying or renting software licenses or subscriptions' },
  { key: 'maintenance-and-support', means: 'running, maintaining or supporting an existing system' },
  { key: 'network-and-security', means: 'network or security systems, with their setup' },
  { key: 'data-and-ai', means: 'data platforms, analytics, AI' },
  { key: 'other-it', means: 'IT work that fits none of the above' },
];

export const PROJECT_CATEGORIES = PROJECT_CATEGORY_MEANINGS.map(({ key }) => key);

export const MAX_CATEGORIES = 3;

/**
 * What a record may hold of `values`: known kinds only, no repeats, the first
 * MAX_CATEGORIES, order kept. Reads an old single category too, as
 * `cleanCategories([category])`: null, 'non-IT' and the like become [].
 */
export const cleanCategories = (values) =>
  [...new Set(values ?? [])].filter((value) => PROJECT_CATEGORIES.includes(value)).slice(0, MAX_CATEGORIES);
