/**
 * server/src/pipeline/extraction/schema.js
 *
 * The response schemas: the exact shape Gemini must answer in. Gemini reads
 * each `description` as the instruction for that field (the SDK recommends it
 * over prose in the prompt), so the rules for a field live next to it.
 *
 * Every property is required and nullable rather than optional: Gemini must
 * say null out loud when a TOR doesn't state something, so "missing" is a
 * decision it made, not a field it forgot (ADR 0014).
 *
 * Any change here changes what Gemini returns. Bump the version at the top of
 * prompts/extract.md in the same commit (ADR 0013).
 */

import { Type } from '@google/genai';

/**
 * Kinds of IT project. Price analysis (FR-19) uses this to find similar past
 * projects: the AI picks the label, and code does the comparing.
 */
export const PROJECT_CATEGORIES = [
  'software-development', // building or customizing software, web or mobile apps
  'systems-integration', // hardware and software delivered and set up as one working system
  'software-licenses', // buying or renting software licenses or subscriptions
  'maintenance-and-support', // running, maintaining or supporting an existing system
  'network-and-security', // network or security systems, with their setup
  'data-and-ai', // data platforms, analytics, AI
  'other-it',
];

const QUOTE =
  'Copied exactly from the document: the same words, the same digits (Thai or Arabic) and the ' +
  'same spacing. One sentence or less.';
const PAGE = 'The number in the nearest "=== Page N ===" line above the quote.';

const text = (description) => ({ type: Type.STRING, nullable: true, description });
const list = (description) => ({ type: Type.ARRAY, items: { type: Type.STRING }, description });

// The quote is written before the value, so the value is read off text the
// model has already copied out, rather than recalled (R5).
function evidenced(value, description) {
  return {
    type: Type.OBJECT,
    nullable: true,
    description: `${description} null when the document does not state it.`,
    properties: {
      quote: { type: Type.STRING, description: QUOTE },
      page: { type: Type.INTEGER, nullable: true, description: PAGE },
      value,
    },
    required: ['quote', 'page', 'value'],
    propertyOrdering: ['quote', 'page', 'value'],
  };
}

// Money is critical and code already has a strict parser for it
// (parseThaiAmount), so the model copies the number and code reads it.
const amount = (description) =>
  evidenced(
    {
      type: Type.STRING,
      description:
        'The amount exactly as written, digits and separators only, e.g. "๑,๘๕๐,๐๐๐.๐๐". ' +
        'Do not convert it.',
    },
    description,
  );

// Thai dates use Buddhist years. The model copies the parts; code converts the
// year, because arithmetic belongs in code (ADR 0013).
const date = (description) =>
  evidenced(
    {
      type: Type.OBJECT,
      description: 'The date as written. Do not convert the year.',
      properties: {
        day: { type: Type.INTEGER, minimum: 1, maximum: 31 },
        month: { type: Type.INTEGER, minimum: 1, maximum: 12, description: 'มกราคม = 1 … ธันวาคม = 12' },
        year: { type: Type.INTEGER, description: 'As written, e.g. 2569' },
        era: {
          type: Type.STRING,
          format: 'enum',
          enum: ['BE', 'CE'],
          description: 'BE for พ.ศ. (Thai years, usually 25xx), CE for ค.ศ.',
        },
        hour: { type: Type.INTEGER, nullable: true, minimum: 0, maximum: 23 },
        minute: { type: Type.INTEGER, nullable: true, minimum: 0, maximum: 59 },
      },
      required: ['day', 'month', 'year', 'era', 'hour', 'minute'],
    },
    description,
  );

// Durations need units understood ("๑๒ เดือน" is 1 year), so here the model
// gives the number; the quote lets the checks verify it.
const number = (unit, description) =>
  evidenced({ type: Type.NUMBER, description: `In ${unit}.` }, description);

// Items where an invented entry would mislead a bidder, and where lock-spec
// will look later: each one carries the text it came from (R5).
const quotedItems = (itemDescription, description) => ({
  type: Type.ARRAY,
  description,
  items: {
    type: Type.OBJECT,
    properties: {
      quote: { type: Type.STRING, description: QUOTE },
      name: { type: Type.STRING, description: itemDescription },
    },
    required: ['quote', 'name'],
    propertyOrdering: ['quote', 'name'],
  },
});

/** Step 1: is this TOR in scope at all? A small call on the first pages (D8). */
export const classifySchema = {
  type: Type.OBJECT,
  properties: {
    quote: {
      type: Type.STRING,
      description: 'The sentence that best shows what the project buys or builds. ' + QUOTE,
    },
    reason: {
      type: Type.STRING,
      description: 'One short sentence in Thai: why this project is or is not in scope.',
    },
    isIT: {
      type: Type.BOOLEAN,
      description:
        'true only when the work includes software or IT services: building, customizing, ' +
        'integrating, licensing, setting up, operating or maintaining software or IT systems. ' +
        'false for buying hardware alone (computers, printers, parts) with no system work, and for ' +
        'work that is not IT at all.',
    },
    category: {
      type: Type.STRING,
      nullable: true,
      format: 'enum',
      enum: PROJECT_CATEGORIES,
      description: 'The kind of IT project. null when isIT is false.',
    },
  },
  required: ['quote', 'reason', 'isIT', 'category'],
  propertyOrdering: ['quote', 'reason', 'isIT', 'category'],
};

/** Step 2: read the whole TOR into the TorInsight sections 4.1–4.9. */
export const extractSchema = {
  type: Type.OBJECT,
  properties: {
    identification: {
      type: Type.OBJECT,
      description: 'Who is buying what. Compared with the feed; the feed is kept when they differ.',
      properties: {
        titleTh: evidenced({ type: Type.STRING }, 'The project title as the document writes it.'),
        agency: evidenced({ type: Type.STRING }, 'The government organization that is buying.'),
        department: text('The division or office responsible, when the document names one.'),
      },
      required: ['titleTh', 'agency', 'department'],
    },
    facts: {
      type: Type.OBJECT,
      description: 'The key numbers and dates. Only what the document states.',
      properties: {
        budget: amount('Budget, งบประมาณ or วงเงินงบประมาณ: what the agency has set aside.'),
        referencePrice: amount(
          'Reference price, ราคากลาง: the official price bids are judged against. Not the budget.',
        ),
        submissionDeadline: date('The last date (and time) to submit a bid, วันยื่นข้อเสนอ.'),
        postedDate: date('The date the announcement or TOR was published.'),
        deliveryPeriodDays: number('calendar days', 'How long the contractor has to deliver, กำหนดส่งมอบ.'),
        contractDurationDays: number(
          'calendar days',
          'How long the whole contract runs, only when the document states a contract period apart from ' +
            'the delivery period. Never repeat the delivery period here.',
        ),
        warrantyYears: number('years', 'Warranty period, รับประกันความชำรุดบกพร่อง. "๑๒ เดือน" is 1.'),
        procurementMethod: evidenced(
          { type: Type.STRING, description: 'As written, e.g. "วิธีประกาศเชิญชวนทั่วไป (e-bidding)".' },
          'How the agency buys.',
        ),
        penaltyClause: evidenced(
          { type: Type.STRING, description: 'A short Thai summary, e.g. "ร้อยละ 0.20 ของค่าจ้างต่อวัน".' },
          'The penalty for late delivery, ค่าปรับ.',
        ),
      },
      required: [
        'budget',
        'referencePrice',
        'submissionDeadline',
        'postedDate',
        'deliveryPeriodDays',
        'contractDurationDays',
        'warrantyYears',
        'procurementMethod',
        'penaltyClause',
      ],
    },
    overview: {
      type: Type.OBJECT,
      description: 'What the project is for, in plain Thai a non-specialist can follow.',
      properties: {
        objective: text('What the agency wants to achieve, in one or two sentences.'),
        majorComponents: list('The main parts of the system or work, one short Thai phrase each.'),
        highLevelScope: text('What is in the scope of work, in two or three sentences.'),
      },
      required: ['objective', 'majorComponents', 'highLevelScope'],
    },
    deliverables: {
      type: Type.OBJECT,
      description: 'What the contractor must hand over. One short Thai phrase per item.',
      properties: {
        system: list('Software, systems, apps or platforms delivered.'),
        implementation: list('Installation, setup, integration, data migration, deployment.'),
        validation: list('Testing and acceptance work.'),
        supportingWork: list('Documents, training, maintenance and support handed over.'),
      },
      required: ['system', 'implementation', 'validation', 'supportingWork'],
    },
    technicalRequirements: {
      type: Type.OBJECT,
      description: 'What the solution must technically satisfy.',
      properties: {
        requiredTechnologies: {
          type: Type.ARRAY,
          description:
            'Named products, platforms, languages, databases or standards the contractor must build ' +
            'with, run on or integrate with. Only ones the document names; never add one because the ' +
            'project "sounds like" it needs it. Browsers or operating systems the finished system must ' +
            'support on users\' machines are not technologies to build with: put them in ' +
            'requiredCapabilities instead, e.g. "รองรับ Google Chrome 96 ขึ้นไป".',
          items: {
            type: Type.OBJECT,
            properties: {
              quote: { type: Type.STRING, description: QUOTE },
              name: { type: Type.STRING, description: 'The name as written, without the version, e.g. "Windows Server".' },
              version: { type: Type.STRING, nullable: true, description: 'e.g. "2019"; null when none is required.' },
            },
            required: ['quote', 'name', 'version'],
            propertyOrdering: ['quote', 'name', 'version'],
          },
        },
        requiredCapabilities: list('Capabilities the solution must have, e.g. "รองรับ Single Sign-On".'),
        infrastructureSpecifications: {
          type: Type.ARRAY,
          description: 'Hardware specifications, keeping the exact values and units.',
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: 'e.g. "CPU", "หน่วยความจำ"' },
              spec: { type: Type.STRING, description: 'e.g. "ไม่น้อยกว่า 24 cores"' },
            },
            required: ['key', 'spec'],
          },
        },
        technicalConstraints: {
          type: Type.ARRAY,
          description: 'Measurable limits, keeping the exact values and units.',
          items: {
            type: Type.OBJECT,
            properties: {
              metric: { type: Type.STRING, description: 'e.g. "Availability", "เวลาตอบสนอง"' },
              value: { type: Type.STRING, description: 'e.g. "ไม่น้อยกว่า 99.9%"' },
            },
            required: ['metric', 'value'],
          },
        },
      },
      required: [
        'requiredTechnologies',
        'requiredCapabilities',
        'infrastructureSpecifications',
        'technicalConstraints',
      ],
    },
    integrationEnvironment: {
      type: Type.OBJECT,
      description: 'The existing environment the work must fit into.',
      properties: {
        existingSystems: list('Existing systems, databases or infrastructure to work with.'),
        interfacesAndApis: list('Interfaces, APIs or data exchange required.'),
        dataMigrationNotes: text('What data must be migrated, and how much.'),
        deploymentLocation: text('Where the system runs, e.g. the agency data center or a government cloud.'),
      },
      required: ['existingSystems', 'interfacesAndApis', 'dataMigrationNotes', 'deploymentLocation'],
    },
    operationalRequirements: {
      type: Type.OBJECT,
      description: 'What the contractor must do beyond building it.',
      properties: {
        installationAndConfig: list('Installation, setup and on-site work.'),
        training: list('Training required, with hours or attendees when stated.'),
        technicalSupportAndSla: text('Support and response-time obligations, keeping the exact times.'),
        maintenance: list('Maintenance obligations.'),
      },
      required: ['installationAndConfig', 'training', 'technicalSupportAndSla', 'maintenance'],
    },
    eligibility: {
      type: Type.OBJECT,
      description: 'Who may bid. Kept separate from technical requirements.',
      properties: {
        companyRequirements: list('Requirements on the bidding company itself, one per item.'),
        requiredCertifications: quotedItems('The certification, e.g. "ISO/IEC 27001".', 'Certifications the bidder must hold.'),
        manufacturerAuthorizations: quotedItems(
          'What must be authorized, e.g. "ตัวแทนจำหน่ายจากผู้ผลิต Oracle".',
          'Letters or authorizations from a manufacturer that the bidder must show.',
        ),
        previousExperience: text('The past-work requirement, in a short Thai sentence.'),
        previousExperienceMin: amount('The minimum value of one past contract the bidder must have done.'),
        personnelQualifications: list('Required staff and their qualifications.'),
      },
      required: [
        'companyRequirements',
        'requiredCertifications',
        'manufacturerAuthorizations',
        'previousExperience',
        'previousExperienceMin',
        'personnelQualifications',
      ],
    },
    contractConditions: {
      type: Type.OBJECT,
      description: 'Commercial and contract terms.',
      properties: {
        paymentTerms: text('How payment is split, e.g. "แบ่งจ่าย 4 งวดตามการส่งมอบงาน".'),
        deliveryConditions: text('Where and how the work is delivered and accepted.'),
        evaluationMethod: text('How bids are judged, e.g. "เกณฑ์ราคา".'),
      },
      required: ['paymentTerms', 'deliveryConditions', 'evaluationMethod'],
    },
  },
  required: [
    'identification',
    'facts',
    'overview',
    'deliverables',
    'technicalRequirements',
    'integrationEnvironment',
    'operationalRequirements',
    'eligibility',
    'contractConditions',
  ],
  propertyOrdering: [
    'identification',
    'facts',
    'overview',
    'deliverables',
    'technicalRequirements',
    'integrationEnvironment',
    'operationalRequirements',
    'eligibility',
    'contractConditions',
  ],
};
