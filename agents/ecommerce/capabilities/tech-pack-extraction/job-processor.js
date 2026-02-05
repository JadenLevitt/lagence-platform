/**
 * Full Job Processor - Downloads PDFs, extracts attributes, creates Google Sheet
 * Called by job-server.js: node job-processor-full.js <job-id>
 */

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  buildExtractionPrompt,
  getTechPackFields,
  getInputCsvFields,
  getAllFieldDefinitions
} = require("./extraction-config");

const JOB_ID = process.argv[2];
if (!JOB_ID) {
  console.error("Usage: node job-processor-full.js <job-id>");
  process.exit(1);
}

// ========== CONFIG ==========
const ENTRY = "https://lagence.yuniquecloud.com/plmOn/Default.aspx?SW=1280&SH=720&OS=MAC";
const OUT_DIR = path.resolve("./out");
const PARALLEL_WORKERS = parseInt(process.env.PARALLEL_WORKERS) || 1;
const HEADLESS = process.env.HEADLESS !== "false";

const USER = process.env.GERBER_USER;
const PASS = process.env.GERBER_PASS;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic();

// ========== CRASH PROTECTION ==========
// Global error handlers to catch crashes and mark job as failed
let heartbeatInterval = null;

process.on('uncaughtException', async (err) => {
  console.error(`[CRASH] Uncaught exception: ${err.message}`);
  console.error(err.stack);
  try {
    await supabase.from("jobs").update({
      status: "failed",
      error_message: `Crash: ${err.message}`
    }).eq("id", JOB_ID);
  } catch (e) {
    console.error(`Failed to update job status on crash: ${e.message}`);
  }
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(`[CRASH] Unhandled rejection: ${reason}`);
  try {
    await supabase.from("jobs").update({
      status: "failed",
      error_message: `Unhandled rejection: ${reason}`
    }).eq("id", JOB_ID);
  } catch (e) {
    console.error(`Failed to update job status on rejection: ${e.message}`);
  }
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  process.exit(1);
});

// Heartbeat - update every 30 seconds so we can detect dead jobs
function startHeartbeat() {
  heartbeatInterval = setInterval(async () => {
    try {
      await supabase.from("jobs").update({
        updated_at: new Date().toISOString()
      }).eq("id", JOB_ID);
    } catch (e) {
      console.error(`Heartbeat failed: ${e.message}`);
    }
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ========== LOGGING ==========
function log(level, msg) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] [${level}] ${msg}`);
}

async function updateJob(updates) {
  const { data, error } = await supabase.from("jobs").update(updates).eq("id", JOB_ID).select();
  if (error) {
    log("ERROR", `Failed to update job: ${error.message}`);
    log("ERROR", `Update payload keys: ${Object.keys(updates).join(', ')}`);
  }
}

// ========== PDF DOWNLOAD FUNCTIONS ==========
function safe(s) { return s.replace(/[^a-zA-Z0-9._-]/g, "_"); }

// Check if a PDF is fresh (created within last N days)
// Tech packs get updated, so we only reuse recent downloads
const PDF_FRESHNESS_DAYS = 15;

function isPdfFresh(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= PDF_FRESHNESS_DAYS;
  } catch {
    return false;
  }
}

function getSeasonPriority(season) {
  const s = (season || "").toUpperCase();
  if (s.includes("FALL") || s.includes("FW") || s.includes("HOLIDAY")) return 4;
  if (s.includes("SUMMER") || s.includes("SS")) return 3;
  if (s.includes("SPRING") || s.includes("PRE")) return 2;
  if (s.includes("WINTER") || s.includes("RESORT")) return 1;
  return 0;
}

// Parse CSV line preserving empty columns (handles quoted fields)
function parseCSVLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  // Don't forget the last field
  cols.push(current.trim());

  return cols;
}

function readStylesFromCSV(csvPath) {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const uniqueStyles = [], seen = new Set(), styleMap = {};
  let header = null;
  let headerMap = {}; // Maps column name -> index

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const cleanCols = cols.map(c => c.replace(/^\"|\"$/g, ""));

    // First row with "style" or "item" in first column is the header
    if (i === 0 && (cleanCols[0].toLowerCase().includes("style") || cleanCols[0].toLowerCase().includes("item"))) {
      header = cleanCols;
      // Build header name -> index mapping for flexible column lookup
      cleanCols.forEach((colName, idx) => {
        if (colName) headerMap[colName.toUpperCase().trim()] = idx;
      });
      continue;
    }

    // Find ITEM ID - could be first column or named column
    let itemId = cleanCols[0] || "";
    if (headerMap["ITEM ID"] !== undefined) {
      itemId = cleanCols[headerMap["ITEM ID"]] || cleanCols[0] || "";
    }

    const styleNo = itemId.split("-")[0];
    if (!styleNo) continue;

    // Store row data as a map of field name -> value for flexible access
    const rowData = {};
    if (header) {
      header.forEach((colName, idx) => {
        if (colName) rowData[colName.toUpperCase().trim()] = cleanCols[idx] || "";
      });
    }

    if (!styleMap[styleNo]) styleMap[styleNo] = [];
    styleMap[styleNo].push({
      itemId,
      styleNo,
      originalRow: cleanCols,    // Keep positional array for backwards compat
      rowData,                    // Add named map for flexible field access
      lineIndex: i
    });
    if (!seen.has(styleNo)) { seen.add(styleNo); uniqueStyles.push(styleNo); }
  }
  return { uniqueStyles, styleToRows: styleMap, header, headerMap };
}

async function uploadPdfToSupabase(filePath, styleNo) {
  const fileName = `Tech_Pack_${safe(styleNo)}.pdf`;
  const fileBuffer = fs.readFileSync(filePath);
  const { error } = await supabase.storage.from("tech-packs").upload(fileName, fileBuffer, { contentType: "application/pdf", upsert: true });
  if (error) log("ERROR", `Upload failed: ${error.message}`);
  return `Tech_Pack_${safe(styleNo)}.pdf`;
}

async function selectMostRecentResult(mainFrame, styleNo) {
  await new Promise(r => setTimeout(r, 1000));
  const rows = await mainFrame.locator("table tr").all();
  let bestRow = null, bestYear = 0, bestSeasonPriority = -1, bestSeasonText = "";

  for (const row of rows) {
    const text = await row.textContent().catch(() => "");
    if (!text.includes(styleNo)) continue;
    const yearMatch = text.match(/20(\d{2})/);
    const year = yearMatch ? parseInt("20" + yearMatch[1]) : 0;
    const seasonMatch = text.match(/(FALL|SPRING|SUMMER|WINTER|HOLIDAY|RESORT|PRE-FALL|PRE-SPRING)/i);
    const seasonText = seasonMatch ? seasonMatch[1].toUpperCase() : "";
    const seasonPriority = getSeasonPriority(text);
    if (year > bestYear || (year === bestYear && seasonPriority > bestSeasonPriority)) {
      bestYear = year; bestSeasonPriority = seasonPriority; bestSeasonText = seasonText; bestRow = row;
    }
  }

  if (bestRow && bestSeasonText) {
    try {
      await bestRow.scrollIntoViewIfNeeded();
      await new Promise(r => setTimeout(r, 300));
      const cells = await bestRow.locator("td").all();
      for (let i = Math.min(5, cells.length - 1); i < cells.length; i++) {
        try {
          const cell = cells[i];
          const cellText = await cell.textContent();
          if (cellText && cellText.trim()) {
            await cell.click();
            return { success: true, season: `${bestSeasonText} ${bestYear}` };
          }
        } catch {}
      }
      await bestRow.getByText(bestSeasonText, { exact: true }).first().click();
      return { success: true, season: `${bestSeasonText} ${bestYear}` };
    } catch {
      try {
        await bestRow.locator("a").first().click();
        return { success: true, season: `${bestSeasonText} ${bestYear}` };
      } catch { return { success: false }; }
    }
  }
  return { success: false };
}

async function downloadTechPack(page, context, mainFrame, styleNo, workerId) {
  log("STYLE", `[W${workerId}] Processing: ${styleNo}`);

  try {
    await mainFrame.locator("#txtStyleNo").fill("");
    await mainFrame.locator("#txtStyleNo").fill(styleNo);
    await mainFrame.getByRole("link", { name: "Search", exact: true }).click();
    await page.waitForTimeout(1500);

    const page2Promise = page.waitForEvent("popup", { timeout: 20000 }).catch(() => { throw new Error("Popup never opened"); });
    const selectResult = await selectMostRecentResult(mainFrame, styleNo);

    if (!selectResult.success) {
      try { await mainFrame.getByText(styleNo, { exact: true }).first().click(); }
      catch {
        const seasons = ["FALL", "SPRING", "SUMMER", "WINTER", "HOLIDAY", "RESORT"];
        let clicked = false;
        for (const season of seasons) { try { await mainFrame.getByText(season, { exact: true }).first().click({ timeout: 2000 }); clicked = true; break; } catch {} }
        if (!clicked) throw new Error("No clickable search result");
      }
    } else { log("SEARCH", `[W${workerId}] Selected: ${selectResult.season}`); }

    const page2 = await page2Promise;
    await page2.waitForLoadState("domcontentloaded");
    await page2.waitForSelector('frame[name="menu"]', { timeout: 30000 });
    const menuFrame2 = page2.locator('frame[name="menu"]').contentFrame();
    await menuFrame2.getByRole("link", { name: "Tech Pack" }).click();
    await page2.waitForTimeout(1000);
    await page2.waitForSelector("#mainF", { timeout: 30000 });
    const mainF = page2.locator("#mainF").contentFrame();

    log("TECHPACK", `[W${workerId}] Creating tech pack...`);
    const page3Promise = page2.waitForEvent("popup", { timeout: 30000 });
    await mainF.getByRole("button", { name: "add_circle_outline" }).click({ force: true });
    const page3 = await page3Promise;
    await page3.waitForLoadState("domcontentloaded");
    await page3.getByText("Predefined", { exact: true }).click({ force: true });
    await page3.getByRole("button", { name: "save" }).click({ force: true });

    log("TECHPACK", `[W${workerId}] Waiting for generation...`);
    await mainF.locator('text=/created successfully/i').first().waitFor({ timeout: 180000 });
    await mainF.getByText(/The Tech Pack \(Collection\).*created successfully/i).first().click({ force: true });

    const downloadPromise = page2.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    const page4Promise = page2.waitForEvent("popup", { timeout: 60000 }).catch(() => null);
    await mainF.getByRole("button", { name: "vertical_align_bottom" }).first().click({ force: true });

    const download = await downloadPromise;
    const page4 = await page4Promise;
    const filePath = path.join(OUT_DIR, `Tech_Pack_${safe(styleNo)}.pdf`);

    if (download) { await download.saveAs(filePath); }
    else if (page4) {
      await page4.waitForLoadState("domcontentloaded", { timeout: 30000 });
      const resp = await context.request.get(page4.url(), { maxRedirects: 20 });
      fs.writeFileSync(filePath, await resp.body());
      await page4.close().catch(() => {});
    } else { throw new Error("No download"); }

    log("DOWNLOAD", `[W${workerId}] Saved: ${styleNo}`);
    await uploadPdfToSupabase(filePath, styleNo);
    await page2.close();
    return { styleNo, success: true, filePath };
  } catch (error) {
    log("ERROR", `[W${workerId}] Failed ${styleNo}: ${error.message}`);
    const pages = context.pages();
    for (const p of pages) { if (p !== page) await p.close().catch(() => {}); }
    return { styleNo, success: false, error: error.message };
  }
}

async function runDownloadWorker(workerId, browser, styleQueue, downloadResults, updateProgress) {
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles'
  });
  const page = await context.newPage();

  // Hide webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
  await page.locator("#txtUserName").fill(USER);
  await page.locator("#txtUserPass").fill(PASS);
  await page.getByRole("button", { name: "Logon" }).click();
  await page.waitForSelector('frame[name="dbody"]', { timeout: 60000 });
  await page.waitForTimeout(3000); // Wait for frames to fully load

  const dbodyFrame = page.locator('frame[name="dbody"]').contentFrame();
  const menuFrame = dbodyFrame.locator('frame[name="menu"]').contentFrame();
  const mainFrame = dbodyFrame.locator('frame[name="main"]').contentFrame();

  await menuFrame.locator('text=Style').first().waitFor({ timeout: 30000 });
  await menuFrame.getByText("Style", { exact: true }).click();
  await page.waitForTimeout(1000);
  await menuFrame.getByRole("link", { name: "Style Search" }).click();
  await page.waitForTimeout(1500);

  log("LOGIN", `[W${workerId}] Ready`);

  while (true) {
    const styleNo = styleQueue.shift();
    if (!styleNo) break;

    const existingPdf = path.join(OUT_DIR, `Tech_Pack_${styleNo}.pdf`);
    if (fs.existsSync(existingPdf) && isPdfFresh(existingPdf)) {
      log("SKIP", `[W${workerId}] Recent PDF exists (< ${PDF_FRESHNESS_DAYS} days): ${styleNo}`);
      downloadResults.push({ styleNo, success: true, skipped: true, filePath: existingPdf });
      await updateProgress("download", styleNo, true);
      continue;
    } else if (fs.existsSync(existingPdf)) {
      log("REFRESH", `[W${workerId}] PDF is stale (> ${PDF_FRESHNESS_DAYS} days), re-downloading: ${styleNo}`);
    }

    const result = await downloadTechPack(page, context, mainFrame, styleNo, workerId);
    downloadResults.push(result);
    await updateProgress("download", styleNo, result.success);

    if (!result.success) {
      try { await menuFrame.getByText("Style", { exact: true }).click(); await menuFrame.getByRole("link", { name: "Style Search" }).click(); await page.waitForTimeout(1000); } catch {}
    }
    await page.waitForTimeout(1000);
  }

  await context.close();
  log("DONE", `[W${workerId}] Download worker finished`);
}

// ========== CLAUDE EXTRACTION ==========
// Uses extraction-config.js as the source of truth for field definitions

// Helper to extract JSON from a response that might have extra text
function extractJsonFromText(text) {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Try to find JSON object in the text
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  return JSON.parse(cleaned);
}

async function extractAttributesFromPdf(pdfPath, styleNo, retryCount = 0) {
  const MAX_RETRIES = 3;
  log("EXTRACT", `Processing: ${styleNo}${retryCount > 0 ? ` (retry ${retryCount})` : ""}`);

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64Pdf = pdfBuffer.toString("base64");
    const extractionPrompt = buildExtractionPrompt(); // From extraction-config.js

    log("DEBUG", `Extraction prompt length: ${extractionPrompt.length} chars`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf
            }
          },
          {
            type: "text",
            text: extractionPrompt
          }
        ]
      }]
    });

    const text = response.content[0].text;

    try {
      const extracted = extractJsonFromText(text);
      log("EXTRACT", `Completed: ${styleNo}`);
      return { styleNo, success: true, data: extracted };
    } catch (parseError) {
      // JSON parsing failed - log first 200 chars of response
      log("WARN", `Invalid JSON from Claude for ${styleNo}: ${text.substring(0, 200)}...`);

      if (retryCount < MAX_RETRIES) {
        log("RETRY", `Retrying extraction for ${styleNo} (JSON parse error)...`);
        await new Promise(r => setTimeout(r, 3000));
        return extractAttributesFromPdf(pdfPath, styleNo, retryCount + 1);
      }

      throw parseError;
    }
  } catch (error) {
    const errorMsg = error.message || String(error);

    // Handle rate limit errors with exponential backoff
    if (errorMsg.includes('429') || errorMsg.includes('rate_limit')) {
      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount + 1) * 30000; // 60s, 120s, 240s
        log("RATE_LIMIT", `Rate limited for ${styleNo}. Waiting ${waitTime/1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
        return extractAttributesFromPdf(pdfPath, styleNo, retryCount + 1);
      }
    }

    log("ERROR", `Extraction failed for ${styleNo}: ${errorMsg}`);
    return { styleNo, success: false, error: errorMsg };
  }
}

// ========== PREPARE EXTRACTED DATA FOR EXPORT ==========
// Takes extraction results and maps them back to ALL original rows
// KEY BEHAVIORS:
// 1. Always outputs ALL canonical fields from FIELD_DEFINITIONS (flexible input)
// 2. Preserves any uploaded data - only fills in EMPTY cells
// Returns both main data and logic/confidence data for a second tab
function prepareExtractedData(extractionResults, styleToRows, originalHeader) {
  // Build a map of styleNo prefix -> extracted data (full object with logic)
  const extractionMap = {};
  for (const result of extractionResults) {
    if (result.success && result.data) {
      extractionMap[result.styleNo] = result.data;
    }
  }

  const getValue = (field) => {
    if (!field) return "";
    if (typeof field === "object" && field.value !== undefined) {
      const val = field.value;
      if (val === "N/A" || val === "n/a") return "";
      return val;
    }
    if (field === "N/A" || field === "n/a") return "";
    return String(field);
  };

  const getLogic = (field) => {
    if (!field) return "";
    if (typeof field === "object" && field.logic !== undefined) return field.logic;
    return "";
  };

  const getNeedsReview = (field) => {
    if (!field) return false;
    if (typeof field === "object" && field.needs_review !== undefined) return field.needs_review;
    return false;
  };

  // Get ALL canonical field names from FIELD_DEFINITIONS
  const allFields = getAllFieldDefinitions();
  const allFieldNames = allFields.map(f => f.field_name);
  const techPackFieldNames = getTechPackFields().map(f => f.field_name);

  // ALWAYS output all canonical fields + PDF_LINK (flexible input support)
  const headers = [...allFieldNames, "PDF_LINK"];

  log("DEBUG", `Original CSV headers: ${originalHeader ? originalHeader.join(', ') : 'none'}`);
  log("DEBUG", `Canonical output headers (${headers.length}): ${headers.join(', ')}`);
  log("DEBUG", `Tech pack fields to fill: ${techPackFieldNames.join(', ')}`);

  const rows = [];
  const logicRows = []; // For the logic tab

  // Iterate through ALL original rows (not just unique prefixes)
  for (const styleNo of Object.keys(styleToRows)) {
    const originalRows = styleToRows[styleNo];
    const extractedData = extractionMap[styleNo] || {};

    const pdfUrl = extractionMap[styleNo]
      ? `https://ijogzenhkweixklrbbvg.supabase.co/storage/v1/object/public/tech-packs/Tech_Pack_${safe(styleNo)}.pdf`
      : "";

    // Create logic rows for this style (one row per field)
    for (const fieldName of techPackFieldNames) {
      const fieldData = extractedData[fieldName];
      logicRows.push({
        "STYLE PREFIX": styleNo,
        "FIELD": fieldName,
        "VALUE": getValue(fieldData),
        "LOGIC": getLogic(fieldData),
        "NEEDS REVIEW": getNeedsReview(fieldData) ? "YES" : "NO"
      });
    }

    for (const origRow of originalRows) {
      const row = {};

      // Build row using ALL canonical fields
      for (const fieldName of allFieldNames) {
        // Look up input value by field name (case-insensitive via rowData map)
        const inputValue = (origRow.rowData && origRow.rowData[fieldName.toUpperCase().trim()]) || "";

        if (techPackFieldNames.includes(fieldName)) {
          // This is a tech_pack field that we extract
          // PRESERVE uploaded data: only use extracted value if input was EMPTY
          if (inputValue && inputValue.trim()) {
            row[fieldName] = inputValue; // Keep user-provided data
          } else {
            row[fieldName] = getValue(extractedData[fieldName]); // Fill in missing
          }
        } else {
          // input_csv or separate_csv field - always use input value (might be empty)
          row[fieldName] = inputValue;
        }
      }

      // Add PDF link
      row["PDF_LINK"] = pdfUrl;

      rows.push(row);
    }
  }

  log("DEBUG", `Prepared ${rows.length} output rows from ${Object.keys(styleToRows).length} unique styles`);
  log("DEBUG", `Prepared ${logicRows.length} logic rows`);

  // Logic tab structure
  const logicHeaders = ["STYLE PREFIX", "FIELD", "VALUE", "LOGIC", "NEEDS REVIEW"];

  return {
    headers,
    rows,
    logicHeaders,
    logicRows
  };
}

// ========== MAIN ==========
async function main() {
  log("START", `Processing job: ${JOB_ID}`);

  // Start heartbeat for crash detection
  startHeartbeat();

  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", JOB_ID).single();
  if (error || !job) {
    log("ERROR", `Job not found: ${JOB_ID}`);
    stopHeartbeat();
    process.exit(1);
  }

  // Track completed styles for resume capability
  let completedDownloads = new Set(job.completed_downloads || []);
  let completedExtractions = new Set(job.completed_extractions || []);
  let partialExtractions = job.partial_extractions || {}; // Map of styleNo -> extracted data

  // Check if this is a resume
  if (completedDownloads.size > 0 || completedExtractions.size > 0) {
    log("RESUME", `Resuming job - ${completedDownloads.size} downloads, ${completedExtractions.size} extractions already done`);
  }

  let totalProcessed = 0;
  let totalStyles = 0;

  // Save progress after each style completes
  const saveCompletedStyle = async (phase, styleNo, extractionData = null) => {
    if (phase === "download") {
      completedDownloads.add(styleNo);
      await supabase.from("jobs").update({
        completed_downloads: Array.from(completedDownloads)
      }).eq("id", JOB_ID);
    } else if (phase === "extract") {
      completedExtractions.add(styleNo);
      if (extractionData) {
        partialExtractions[styleNo] = extractionData;
      }
      await supabase.from("jobs").update({
        completed_extractions: Array.from(completedExtractions),
        partial_extractions: partialExtractions
      }).eq("id", JOB_ID);
    }
  };

  const updateProgress = async (phase, styleNo, success, extractionData = null) => {
    totalProcessed++;
    const percent = Math.round((totalProcessed / (totalStyles * 2)) * 100); // *2 for download + extract phases
    await updateJob({
      current_style: `${phase}: ${styleNo}`,
      progress_percent: Math.min(percent, 99)
    });

    // Save completed style for resume capability
    if (success) {
      await saveCompletedStyle(phase, styleNo, extractionData);
    }
  };

  try {
    // Download input file
    const inputPath = path.join(OUT_DIR, `input_${JOB_ID}.csv`);
    const { data: fileData, error: fileError } = await supabase.storage.from("job-inputs").download(job.input_file_name);
    if (fileError) throw new Error(`Failed to download input: ${fileError.message}`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(inputPath, Buffer.from(await fileData.arrayBuffer()));

    const { uniqueStyles, styleToRows, header: originalHeader } = readStylesFromCSV(inputPath);
    totalStyles = uniqueStyles.length;
    await updateJob({ style_count: totalStyles, status: "processing" });

    log("INFO", `Found ${totalStyles} styles`);

    // ========== PHASE 1: DOWNLOAD PDFS ==========
    log("PHASE", "Starting PDF downloads...");

    // Filter out already-completed downloads for resume capability
    const stylesToDownload = uniqueStyles.filter(s => !completedDownloads.has(s));
    const styleQueue = [...stylesToDownload];
    const downloadResults = [];

    // Pre-populate results for already-completed downloads
    for (const styleNo of completedDownloads) {
      const existingPdf = path.join(OUT_DIR, `Tech_Pack_${safe(styleNo)}.pdf`);
      if (fs.existsSync(existingPdf) && isPdfFresh(existingPdf)) {
        downloadResults.push({ styleNo, success: true, skipped: true, filePath: existingPdf });
        totalProcessed++; // Count toward progress
      } else {
        // PDF file is missing or stale, need to re-download
        if (fs.existsSync(existingPdf)) {
          log("REFRESH", `PDF is stale (> ${PDF_FRESHNESS_DAYS} days), will re-download: ${styleNo}`);
        }
        styleQueue.push(styleNo);
        completedDownloads.delete(styleNo); // Remove from completed
      }
    }

    if (stylesToDownload.length < uniqueStyles.length) {
      log("RESUME", `Skipping ${uniqueStyles.length - stylesToDownload.length} already-downloaded styles`);
    }

    const browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });
    const workerCount = Math.min(PARALLEL_WORKERS, uniqueStyles.length);
    const workerPromises = [];
    for (let i = 1; i <= workerCount; i++) {
      workerPromises.push(runDownloadWorker(i, browser, styleQueue, downloadResults, updateProgress));
    }
    await Promise.all(workerPromises);
    await browser.close();

    const successfulDownloads = downloadResults.filter(r => r.success);
    log("PHASE", `Downloads complete: ${successfulDownloads.length}/${totalStyles}`);

    // ========== PHASE 2: EXTRACT ATTRIBUTES ==========
    log("PHASE", "Starting attribute extraction...");

    const extractionResults = [];

    // Filter out already-completed extractions for resume capability
    const stylesToExtract = successfulDownloads.filter(d => !completedExtractions.has(d.styleNo));

    if (stylesToExtract.length < successfulDownloads.length) {
      log("RESUME", `Skipping ${successfulDownloads.length - stylesToExtract.length} already-extracted styles`);
      // Add placeholder results for already-extracted styles (data will be loaded from saved state)
      for (const download of successfulDownloads) {
        if (completedExtractions.has(download.styleNo)) {
          totalProcessed++; // Count toward progress
        }
      }
    }

    for (const download of stylesToExtract) {
      if (!download.filePath) continue;

      const result = await extractAttributesFromPdf(download.filePath, download.styleNo);
      extractionResults.push(result);
      // Pass extraction data for saving (for resume capability)
      await updateProgress("extract", download.styleNo, result.success, result.success ? result.data : null);

      // Rate limit: wait 5 seconds between API calls to avoid 429 errors
      await new Promise(r => setTimeout(r, 5000));
    }

    const successfulExtractions = extractionResults.filter(r => r.success);
    log("PHASE", `Extractions complete: ${successfulExtractions.length}/${stylesToExtract.length}`);

    // ========== PHASE 3: SAVE EXTRACTED DATA ==========
    log("PHASE", "Saving extracted data to Supabase...");

    // Combine new extraction results with previously-saved partial extractions
    const allExtractionResults = [...extractionResults];
    for (const styleNo of Object.keys(partialExtractions)) {
      // Only add if not already in extractionResults
      if (!extractionResults.find(r => r.styleNo === styleNo)) {
        allExtractionResults.push({
          styleNo,
          success: true,
          data: partialExtractions[styleNo]
        });
      }
    }
    log("DEBUG", `Total extraction results: ${allExtractionResults.length} (${extractionResults.length} new + ${Object.keys(partialExtractions).length} resumed)`);

    const extractedData = prepareExtractedData(allExtractionResults, styleToRows, originalHeader);
    log("DEBUG", `Extracted data: ${extractedData.rows.length} rows, ${extractedData.headers.length} headers`);
    log("DEBUG", `Logic tab: ${extractedData.logicRows.length} logic rows, ${extractedData.logicHeaders.length} headers`);
    if (extractedData.logicRows.length > 0) {
      log("DEBUG", `Sample logic row: ${JSON.stringify(extractedData.logicRows[0])}`);
    }

    // ========== COMPLETE ==========
    await updateJob({
      status: "ready_for_export",
      progress_percent: 100,
      successful_count: successfulExtractions.length,
      failed_count: totalStyles - successfulExtractions.length,
      extracted_data: extractedData
    });

    log("COMPLETE", `Job finished. Data ready for export to Google Sheets.`);
    stopHeartbeat();

  } catch (error) {
    log("ERROR", `Job failed: ${error.message}`);
    await updateJob({ status: "failed", error_message: error.message });
    stopHeartbeat();
    process.exit(1);
  }
}

main();
