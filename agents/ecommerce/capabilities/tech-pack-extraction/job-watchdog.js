/**
 * Job Watchdog - Monitors for crashed/failed jobs and auto-restarts them
 *
 * Checks for:
 * 1. Dead jobs: status = "processing" but no heartbeat for 2+ minutes
 * 2. Failed jobs: status = "failed" with transient errors (browser crash, timeout)
 *
 * When found, spawns a new job-processor.js which will resume from saved progress.
 *
 * Run with: node job-watchdog.js
 * Or with PM2: pm2 start job-watchdog.js --name watchdog
 */

const { createClient } = require("@supabase/supabase-js");
const { spawn } = require("child_process");
const path = require("path");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
const STALE_THRESHOLD_MS = 120000; // Consider dead if no heartbeat for 2 minutes
const MAX_RESTART_ATTEMPTS = 10; // Allow more retries since jobs make progress each time
const FAILED_RETRY_WINDOW_MS = 300000; // Only retry failed jobs from last 5 minutes

// Transient errors that should trigger a retry
const RETRYABLE_ERRORS = [
  'Target page, context or browser has been closed',
  'browser has been closed',
  'context has been closed',
  'page has been closed',
  'Popup never opened',
  'Navigation timeout',
  'Timeout exceeded',
  'net::ERR_',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  'Unhandled rejection'
];

// Track restart attempts to avoid infinite loops
const restartAttempts = new Map(); // jobId -> count

function log(msg) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] [WATCHDOG] ${msg}`);
}

// Check if an error message is retryable
function isRetryableError(errorMsg) {
  if (!errorMsg) return false;
  return RETRYABLE_ERRORS.some(pattern => errorMsg.includes(pattern));
}

async function checkForFailedJobs() {
  try {
    // Find jobs that failed recently with retryable errors
    const recentTime = new Date(Date.now() - FAILED_RETRY_WINDOW_MS).toISOString();

    const { data: failedJobs, error } = await supabase
      .from("jobs")
      .select("id, updated_at, style_count, progress_percent, current_style, completed_downloads, completed_extractions, error_message")
      .eq("status", "failed")
      .gt("updated_at", recentTime);

    if (error) {
      log(`Error checking for failed jobs: ${error.message}`);
      return;
    }

    if (!failedJobs || failedJobs.length === 0) {
      return;
    }

    // Filter to only retryable errors
    const retryableJobs = failedJobs.filter(job => isRetryableError(job.error_message));

    if (retryableJobs.length === 0) {
      return;
    }

    log(`Found ${retryableJobs.length} failed job(s) with retryable errors`);

    for (const job of retryableJobs) {
      await restartJob(job, "failed-retry");
    }
  } catch (err) {
    log(`Failed jobs check error: ${err.message}`);
  }
}

async function checkForDeadJobs() {
  try {
    // Find jobs that are "processing" but haven't updated recently
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

    const { data: deadJobs, error } = await supabase
      .from("jobs")
      .select("id, updated_at, style_count, progress_percent, current_style, completed_downloads, completed_extractions")
      .eq("status", "processing")
      .lt("updated_at", staleTime);

    if (error) {
      log(`Error checking for dead jobs: ${error.message}`);
      return;
    }

    if (!deadJobs || deadJobs.length === 0) {
      return; // No dead jobs
    }

    log(`Found ${deadJobs.length} dead job(s)`);

    for (const job of deadJobs) {
      await restartJob(job, "dead");
    }
  } catch (err) {
    log(`Watchdog error: ${err.message}`);
  }
}

async function restartJob(job, reason) {
  const attempts = restartAttempts.get(job.id) || 0;

  if (attempts >= MAX_RESTART_ATTEMPTS) {
    log(`Job ${job.id} has failed ${attempts} times, not restarting`);
    if (reason === "dead") {
      await supabase.from("jobs").update({
        status: "failed",
        error_message: `Job crashed ${attempts} times and was not restarted. Last progress: ${job.progress_percent}% at ${job.current_style}`
      }).eq("id", job.id);
    }
    restartAttempts.delete(job.id);
    return;
  }

  log(`Restarting job ${job.id} [${reason}] (attempt ${attempts + 1}/${MAX_RESTART_ATTEMPTS})`);
  log(`  - Progress: ${job.progress_percent}%`);
  log(`  - Last style: ${job.current_style}`);
  log(`  - Downloads done: ${(job.completed_downloads || []).length}`);
  log(`  - Extractions done: ${(job.completed_extractions || []).length}`);
  if (job.error_message) {
    log(`  - Error: ${job.error_message.substring(0, 100)}`);
  }

  // Update job status to show it's being restarted
  await supabase.from("jobs").update({
    status: "processing",
    updated_at: new Date().toISOString(),
    current_style: `restarting (attempt ${attempts + 1})`,
    error_message: null
  }).eq("id", job.id);

  // Spawn new processor
  const processorPath = path.join(__dirname, "job-processor.js");
  const child = spawn("node", [processorPath, job.id], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();

  restartAttempts.set(job.id, attempts + 1);
  log(`Spawned processor for job ${job.id} (pid: ${child.pid})`);
}

// Clean up restart attempts for completed/failed jobs periodically
async function cleanupRestartAttempts() {
  if (restartAttempts.size === 0) return;

  const jobIds = Array.from(restartAttempts.keys());
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, status")
    .in("id", jobIds);

  if (jobs) {
    for (const job of jobs) {
      if (job.status !== "processing") {
        restartAttempts.delete(job.id);
        log(`Cleared restart tracking for ${job.id} (status: ${job.status})`);
      }
    }
  }
}

async function main() {
  log("Starting job watchdog...");
  log(`Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
  log(`Stale threshold: ${STALE_THRESHOLD_MS / 1000}s`);
  log(`Failed retry window: ${FAILED_RETRY_WINDOW_MS / 1000}s`);
  log(`Max restart attempts: ${MAX_RESTART_ATTEMPTS}`);
  log(`Retryable errors: ${RETRYABLE_ERRORS.length} patterns`);

  // Initial check
  await checkForDeadJobs();
  await checkForFailedJobs();

  // Run periodically
  setInterval(async () => {
    await checkForDeadJobs();
    await checkForFailedJobs();
    await cleanupRestartAttempts();
  }, CHECK_INTERVAL_MS);
}

main();
