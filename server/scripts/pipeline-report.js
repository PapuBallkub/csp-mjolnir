/**
 * server/scripts/pipeline-report.js
 *
 * What the scheduled pipeline did (ADR 0027): its jobs, the feed's answers,
 * the title screen's verdicts and what reached the catalog, from the records
 * the runs leave in MongoDB.
 *
 * Usage:
 *   npm run report                 # the last 24 hours
 *   npm run report -- --hours 48
 */

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { FeedPoll, PipelineFailure, PipelineRun, TitleScreen, TorInsight } from '#models/index.js';
import { bangkokTime } from '#pipeline/jobs/schedule.js';

const minutes = (ms) => `${Math.round(ms / 60_000)} min`;
const percent = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : '-');

async function jobs(since) {
  const runs = await PipelineRun.find({ startedAt: { $gte: since } }).sort({ startedAt: 1 }).lean();
  console.log(`\nJOBS (${runs.length})`);
  for (const run of runs) {
    const took = run.finishedAt ? minutes(run.finishedAt - run.startedAt) : 'not finished: still running, or stopped by Ctrl+C';
    const failed = run.steps.filter((step) => step.exitCode !== null && step.exitCode !== 0).map((step) => `${step.name} exit ${step.exitCode}`);
    console.log(
      `  ${bangkokTime(run.startedAt)}  ${run.job.padEnd(7)} ${run.outcome.padEnd(9)} ${took}` +
        (failed.length ? ` · ${failed.join(', ')}` : '') +
        (run.error ? ` · ${run.error.slice(0, 100)}` : ''),
    );
  }
}

async function feed(since) {
  const polls = await FeedPoll.find({ startedAt: { $gte: since } }).lean();
  const national = polls.filter((poll) => !poll.deptId);
  const agencies = polls.filter((poll) => poll.deptId);
  const sum = (list, key) => list.reduce((total, poll) => total + (poll[key] ?? 0), 0);
  console.log('\nFEED');
  for (const [label, list] of [['national', national], ['agencies', agencies]]) {
    if (!list.length) continue;
    const items = {};
    for (const poll of list) for (const [code, n] of Object.entries(poll.itemsByType ?? {})) items[code] = (items[code] ?? 0) + n;
    console.log(
      `  ${label}: ${list.length} poll(s), ${sum(list, 'requested')} requests, ` +
        `${percent(sum(list, 'answered'), sum(list, 'requested'))} answered, ` +
        `${list.filter((poll) => poll.closed).length} at closed hours, ` +
        `${list.filter((poll) => poll.rateLimited).length} refused (HTTP 429: e-GP asked us to slow down) · ` +
        `${sum(list, 'discovered')} new project(s), ${sum(list, 'updated')} followed seen again`,
    );
    console.log(`    items by code: ${Object.entries(items).map(([code, n]) => `${code} ${n}`).join(', ') || 'none'}`);
  }

  // e-GP's own count of each day (countbyday) against what its list showed
  for (const poll of national.filter((p) => Object.keys(p.countByType ?? {}).length)) {
    const seen = Object.entries(poll.countByType).map(([code, count]) => `${code} ${poll.itemsByType?.[code] ?? 0} of ${count}`);
    console.log(`  national ${bangkokTime(poll.startedAt)}: seen ${seen.join(', ')} announced that day`);
  }
  const byDay = agencies.filter((poll) => poll.announceDate);
  if (byDay.length) {
    const cut = byDay.filter((poll) =>
      Object.entries(poll.countByType ?? {}).some(([code, count]) => count > (poll.itemsByType?.[code] ?? 0)),
    );
    console.log(
      `  full agency lists asked again day by day: ${byDay.length}; still cut off: ${cut.length}` +
        (cut.length ? ` (${cut.map((poll) => `${poll.deptId} ${poll.announceDate}`).join(', ')})` : ''),
    );
  } else {
    const full = agencies.filter((poll) => Object.values(poll.itemsByType ?? {}).some((n) => n >= 20));
    if (full.length) {
      console.log(`  agencies with a full list (20, some may be cut off): ${[...new Set(full.map((poll) => poll.deptId))].join(', ')}`);
    }
  }
  const silent = polls.filter((poll) => poll.requested && !poll.answered && !poll.rateLimited);
  for (const poll of silent.slice(0, 5)) {
    console.log(`  NO ANSWER ${bangkokTime(poll.startedAt)} ${poll.deptId || 'national'}: ${poll.problems?.[0] ?? ''}`);
  }
}

async function screen(since) {
  const screens = await TitleScreen.find({ screenedAt: { $gte: since } }).lean();
  const count = (test) => screens.filter(test).length;
  console.log('\nTITLE SCREEN');
  console.log(
    `  ${screens.length} screened: ${count((s) => s.verdict === 'it')} it, ${count((s) => s.verdict === 'unsure')} unsure, ` +
      `${count((s) => s.verdict === 'not_it')} not_it (${count((s) => s.audit)} audited)`,
  );
  // An audited not_it that classify found IT is one the screen got wrong
  const audited = screens.filter((s) => s.audit).map((s) => s.projectId);
  const insights = await TorInsight.find({ projectId: { $in: audited } }, { projectId: 1, metadata: 1, identification: 1 }).lean();
  const missed = insights.filter((insight) => !insight.metadata?.excluded);
  console.log(
    `  audit: ${insights.length} of ${audited.length} classified so far; ` +
      `${missed.length} turned out IT (the screen's misses)${missed.length ? `: ${missed.map((i) => i.projectId).join(', ')}` : ''}`,
  );
}

async function catalog(since) {
  const insights = await TorInsight.find({ 'metadata.processedAt': { $gte: since }, 'metadata.origin': { $ne: 'demo' } }).lean();
  const extracted = insights.filter((i) => !i.metadata.excluded && !i.metadata.awaitingFullText);
  console.log('\nCLASSIFY AND EXTRACT');
  console.log(
    `  ${insights.length} result(s): ${extracted.length} extracted, ` +
      `${insights.filter((i) => i.metadata.excluded).length} excluded (not IT), ` +
      `${insights.filter((i) => i.metadata.awaitingFullText).length} IT waiting for the full text`,
  );
  for (const insight of extracted) {
    console.log(`    ${insight.projectId} score ${insight.metadata.confidenceScore ?? '-'} · ${String(insight.identification?.titleTh ?? '').slice(0, 80)}`);
  }

  const failures = await PipelineFailure.find({ lastFailedAt: { $gte: since } }).lean();
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length})`);
    for (const failure of failures.slice(0, 15)) {
      console.log(`  ${failure.projectId} ${failure.step} · attempt ${failure.attempts}${failure.lastTransient ? ' (outage)' : ''} · ${failure.lastError.slice(0, 100)}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const hours = Number.parseFloat(argv.includes('--hours') ? argv[argv.indexOf('--hours') + 1] : '24');
  if (!(hours > 0)) throw new Error('--hours takes a number of hours, e.g. 24');
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  await connectDatabase();
  try {
    console.log(`Pipeline report: since ${bangkokTime(since)} (Bangkok time)`);
    await jobs(since);
    await feed(since);
    await screen(since);
    await catalog(since);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
