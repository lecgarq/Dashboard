#!/usr/bin/env node
/* eslint-disable */
require('tsx/cjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const { loadPriorityInputs, resolveFairnessReserve, PRIORITY_WINDOW_DAYS } = require('../../lib/acc/dcIngest');
const { buildExtractionPriorityPlan } = require('../../lib/acc/extractionPriorityPlanner');

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padl(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

(async () => {
  const url = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ['error'] });
  try {
    const now = new Date();
    const inputs = await loadPriorityInputs(prisma);
    const plan = buildExtractionPriorityPlan({
      generatedAt: now,
      windowDays: PRIORITY_WINDOW_DAYS,
      projects: inputs.projects,
      activity: inputs.activity,
      backfillProgress: inputs.backfillProgress,
      limit: 500,
    });

    console.log('====================================================================');
    console.log('DC PRIORITY-MODE DRY-RUN  (READ-ONLY — no env / code / Task Scheduler changes)');
    console.log('====================================================================');
    console.log('generatedAt           :', plan.generatedAt);
    console.log('window                :', plan.window.from, '->', plan.window.to, '(' + plan.window.days + 'd)');
    console.log('expectedServices      :', plan.expectedServices.join(', '));
    console.log('total projects ranked :', plan.rankedProjects.length, '/ universe', inputs.projects.length);
    console.log('');
    console.log('Lane summary:');
    const s = plan.summary;
    console.log('  use_quota_first         :', s.useQuotaFirst);
    console.log('  needs_activity_backfill :', s.needsActivityBackfill);
    console.log('  needs_permissions_crawl :', s.needsPermissionsCrawl);
    console.log('  good_coverage           :', s.goodCoverage);
    console.log('  skip_archived_or_demo   :', s.skipArchivedOrDemo);
    console.log('');

    console.log('TOP 20 BY PRIORITY');
    console.log('rank score lane                     act_rows act_d miss_services backfill        crawl    mem  name');
    console.log('---- ----- ------------------------ -------- ----- ------------- --------------- -------- ---- --------------------------------------------------');
    for (const p of plan.rankedProjects.slice(0, 20)) {
      console.log(
        padl(p.rank, 4),
        padl(p.score, 5),
        pad(p.lane, 24),
        padl(p.activityRows.toLocaleString(), 8),
        padl(p.activeDays, 5),
        pad((p.missingServices.join(',') || '-').slice(0, 13), 13),
        pad(p.formalBackfillState, 15),
        pad(p.folderCrawlStatus, 8),
        padl(p.memberCount, 4),
        ' ',
        (p.projectName || p.projectId).slice(0, 60),
      );
    }
    console.log('');

    console.log('BOTTOM 10 (these would be deferred when quota is tight)');
    console.log('rank score lane                     act_rows act_d  name');
    console.log('---- ----- ------------------------ -------- -----  --------------------------------------------------');
    for (const p of plan.rankedProjects.slice(-10)) {
      console.log(
        padl(p.rank, 4), padl(p.score, 5), pad(p.lane, 24),
        padl(p.activityRows.toLocaleString(), 8), padl(p.activeDays, 5),
        ' ', (p.projectName || p.projectId).slice(0, 70),
      );
    }
    console.log('');

    const ranked = plan.rankedProjects;

    function simulateBudget(budget) {
      const reserve = resolveFairnessReserve(budget);
      const prefix = budget - reserve;
      console.log('-- budget=' + budget + '  fairnessReserve=' + reserve + '  (priority prefix=' + prefix + ', fairness picks=' + reserve + ')');
      const prioritySlots = prefix * 50;
      const fairnessSlots = reserve * 50;
      const priorityProjects = ranked.slice(0, prioritySlots);
      const tailProjects = ranked.slice(prioritySlots);
      const ageById = inputs.ageByProjectId;
      const tailWithAge = tailProjects.map(function (p) {
        return { p: p, age: ageById.get(p.projectId) === undefined ? Number.POSITIVE_INFINITY : ageById.get(p.projectId) };
      });
      tailWithAge.sort(function (a, b) { return (a.age - b.age) || (a.p.rank - b.p.rank); });
      const fairnessPicks = tailWithAge.slice(0, fairnessSlots).map(function (x) { return x.p; });
      const fairnessIds = new Set(fairnessPicks.map(function (p) { return p.projectId; }));
      const runnable = priorityProjects.concat(fairnessPicks);
      const deferred = tailProjects.filter(function (p) { return !fairnessIds.has(p.projectId); });
      console.log('   priority slots covered : ' + priorityProjects.length + ' projects (top ' + prioritySlots + ' ranked)');
      console.log('   fairness reserve fills : ' + fairnessPicks.length + ' of ' + fairnessSlots + ' possible (oldest-progressed first)');
      console.log('   total RUNNABLE         : ' + runnable.length + ' projects -> ~' + Math.ceil(runnable.length / 50) + ' DC requests');
      console.log('   total DEFERRED         : ' + deferred.length + ' projects');
      console.log('   first 3 priority picks :');
      for (const p of ranked.slice(0, 3)) {
        console.log('      #' + p.rank + ' [' + p.lane + '] score=' + p.score + '  ' + p.projectName);
      }
      if (fairnessPicks.length > 0) {
        console.log('   first 3 fairness picks :');
        for (const p of fairnessPicks.slice(0, 3)) {
          const age = ageById.get(p.projectId);
          console.log('      rank#' + p.rank + ' ageRank=' + age + ' [' + p.lane + '] score=' + p.score + '  ' + p.projectName);
        }
      } else {
        console.log('   first 3 fairness picks : (none — budget covers all ranked projects)');
      }
      if (deferred.length > 0) {
        console.log('   first 3 deferred       :');
        for (const p of deferred.slice(0, 3)) {
          console.log('      rank#' + p.rank + ' [' + p.lane + '] score=' + p.score + '  ' + p.projectName);
        }
      } else {
        console.log('   first 3 deferred       : (none — all projects fit within budget)');
      }
      console.log('');
      return { runnable: runnable.length, deferred: deferred.length, reserve: reserve };
    }

    console.log('BUDGET SIMULATIONS');
    simulateBudget(20);
    simulateBudget(25);

    const fairSampleTop3 = inputs.projects.slice(0, 3).map(function (p) { return p.name || p.id; });
    const priorSampleTop3 = ranked.slice(0, 3).map(function (p) { return p.projectName; });
    const overlap = fairSampleTop3.filter(function (n) { return priorSampleTop3.indexOf(n) >= 0; }).length;
    console.log('FAIR vs PRIORITY — top-3 overlap:', overlap, '/ 3');
    console.log('  fair top-3     :', fairSampleTop3.join(' | '));
    console.log('  priority top-3 :', priorSampleTop3.join(' | '));
    console.log('');

    console.log('CONTEXT:');
    console.log('  Today actual run: 426 projects in 9 DC requests (success).');
    console.log('  At ~47 projects/request, budget=20 => ~940 project-slots; budget=25 => ~1175.');
    console.log('  Project universe = 428. Headroom is large under fair mode TODAY.');
    console.log('  Priority only diverges from fair when a day runs out of quota mid-sweep.');
    console.log('');

    const recommendedReserve = Math.max(1, Math.floor(20 * 0.2));
    console.log('RECOMMENDED ENV (if/when enabling — NOT applied):');
    console.log('  DC_PRIORITY_BACKFILL=1');
    console.log('  DC_FAIRNESS_RESERVE=' + recommendedReserve + '   (default ~20% of safe budget; raise if you see starvation, lower for stricter value-first)');
    console.log('  DC_DAILY_SAFE_BUDGET=20  (matches the ~25/day cap with 5-unit safety margin; bumping to 25 only matters on heavy days)');
    console.log('');
    console.log('====================================================================');
    console.log('END OF DRY-RUN — no state mutated.');
    console.log('====================================================================');
  } finally {
    await prisma.$disconnect().catch(function () {});
  }
})().catch(function (e) { console.error(e); process.exit(1); });
