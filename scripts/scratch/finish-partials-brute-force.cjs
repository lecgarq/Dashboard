#!/usr/bin/env node
/**
 * scripts/scratch/finish-partials-brute-force.cjs
 *
 * Runs the folder crawler targeting ONLY "partial" projects,
 * but with the hard cap extended from 15 minutes to 3 hours (10,800,000ms)
 * to ensure that even the absolute largest projects finish completely
 * without getting suspended.
 */

process.env.FOLDER_CRAWL_STATUSES = "partial";
process.env.FOLDER_CRAWL_HARD_CAP_MS = "10800000"; // 3 hours

console.log("=== FINISHING PARTIAL CRAWLS (BRUTE FORCE) ===");
console.log("Setting Hard Cap to 3 Hours (10,800,000ms)");
console.log("Targeting statuses: 'partial'");

// Just require the cron which will immediately start with these env vars
require("../folder-crawl-cron.cjs");
