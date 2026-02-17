import type { Express } from "express";
import { createServer, type Server } from "http";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { z } from "zod";
import path from "path";
import multer from "multer";
import { config } from "./config";

// Dynamic require for plain JS CommonJS modules (not bundled by esbuild)
const REPO_ROOT = path.resolve(__dirname, "..");
function loadModule(relativePath: string) {
  return require(path.join(REPO_ROOT, relativePath));
}

// Initialize Supabase client
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// Initialize Anthropic SDK
const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

// Load agents from filesystem
const {
  loadAllAgents,
  buildAgentSystemPrompt,
} = loadModule("core/agent-loader");

const { classifyRequest } = loadModule("core/github-pr-service");

const { getAllFieldDefinitions } = loadModule(
  "agents/ecommerce/capabilities/tech-pack-extraction/extraction-config"
);

// Agent auto-reload (hot-reload during development)
let agents: Record<string, any> = loadAllAgents();
console.log(`Loaded agents: ${Object.keys(agents).join(", ") || "none"}`);
setInterval(() => {
  agents = loadAllAgents();
}, 30000);

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const uuidSchema = z.string().uuid("Invalid job ID format");

// Rate limiting
const rateLimiter = new Map<string, number[]>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;

  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, []);
  }

  const requests = rateLimiter.get(ip)!.filter((t) => t > windowStart);
  rateLimiter.set(ip, requests);

  if (requests.length >= RATE_LIMIT) {
    return false;
  }

  requests.push(now);
  return true;
}

// Clean up rate limiter periodically
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;
  rateLimiter.forEach((requests, ip) => {
    const filtered = requests.filter((t: number) => t > windowStart);
    if (filtered.length === 0) {
      rateLimiter.delete(ip);
    } else {
      rateLimiter.set(ip, filtered);
    }
  });
}, 60000);

// Email notification for capability change requests
async function sendCapabilityChangeNotification({
  agentId,
  classification,
  userMessage,
}: {
  agentId: string;
  classification: any;
  userMessage: string;
}) {
  console.log(
    `Capability change request: ${classification.request_type} for ${agentId}`
  );
  console.log(`  Description: ${classification.change_description}`);

  const { data, error } = await supabase
    .from("capability_proposals")
    .insert({
      agent_id: agentId,
      title: classification.change_description,
      description: userMessage,
      complexity: classification.complexity,
      status: "pending_approval",
      proposed_changes: {
        request_type: classification.request_type,
        affected_files: classification.affected_files,
        matched_capability: classification.matched_capability_id,
      },
    })
    .select()
    .single();

  if (error) {
    console.log(`Failed to save capability proposal: ${error.message}`);
    return { success: false, error: error.message };
  }

  // Send email if Resend is configured
  const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;
  if (process.env.RESEND_API_KEY && NOTIFICATION_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
          to: NOTIFICATION_EMAIL,
          subject: `[${agentId}] Capability Change Request: ${classification.change_description}`,
          html: `<h2>New Capability Change Request</h2>
<p><strong>Agent:</strong> ${agentId}</p>
<p><strong>Type:</strong> ${classification.request_type}</p>
<p><strong>Complexity:</strong> ${classification.complexity}</p>
<p><strong>Description:</strong> ${classification.change_description}</p>
<p><strong>User Request:</strong> ${userMessage}</p>`,
        }),
      });
      console.log(`Email notification sent to ${NOTIFICATION_EMAIL}`);
    } catch (e: any) {
      console.log(`Email send error: ${e.message}`);
    }
  }

  return { success: true, proposalId: data.id };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Health Check ───
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      agents: Object.keys(agents),
      uptime: process.uptime(),
    });
  });

  // ─── Agent Routes ───
  app.get("/api/agents", (_req, res) => {
    res.json({
      agents: Object.values(agents).map((a: any) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        greeting: a.greeting,
        expertise: a.expertise,
        url_patterns: a.url_patterns,
      })),
    });
  });

  app.get("/api/agents/:id", (req, res) => {
    const agentId = req.params.id;
    const agent = agents[agentId];

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        title: agent.title,
        personality: agent.personality,
        greeting: agent.greeting,
        expertise: agent.expertise,
        capabilities: agent.capabilities.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          triggers: c.triggers,
        })),
        knows_about_agents: agent.knows_about_agents,
      },
    });
  });

  // ─── Chat with Agent ───
  app.post("/api/chat", async (req, res) => {
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";

    if (!checkRateLimit(clientIP)) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded. Try again in a minute." });
    }

    try {
      const body = req.body;

      if (!body.messages || !Array.isArray(body.messages)) {
        return res.status(400).json({ error: "Missing messages array" });
      }

      if (body.messages.length > 50) {
        return res
          .status(400)
          .json({ error: "Too many messages in conversation (max 50)" });
      }

      // Accept both agent_id and agent param
      const agentId = body.agent_id || body.agent || "ecommerce";
      const agent = agents[agentId];

      if (!agent) {
        return res.status(400).json({ error: `Unknown agent: ${agentId}` });
      }

      console.log(`Chat request for agent: ${agent.name}`);

      const systemPrompt = buildAgentSystemPrompt(agentId);

      const classification = await classifyRequest(
        body.messages,
        agent.capabilities,
        anthropic
      );

      console.log(
        `Classification: ${classification.request_type} (${classification.complexity})`
      );

      // Handle capability change requests
      if (
        classification.request_type === "capability_tweak" ||
        classification.request_type === "new_capability"
      ) {
        const lastUserMessage = body.messages
          .filter((m: any) => m.role === "user")
          .pop();
        const userMessage = lastUserMessage?.content || "";

        const result = await sendCapabilityChangeNotification({
          agentId,
          classification,
          userMessage,
        });

        const responseMessage = result.success
          ? `Got it! I've logged your request and sent it to the team for review. We'll follow up once it's ready.`
          : `I understood your request but ran into a small issue saving it. Mind trying again?`;

        return res.json({
          agent: { id: agent.id, name: agent.name },
          message: responseMessage,
          classification,
          action_taken: result.success
            ? { type: "proposal_created", proposal_id: result.proposalId }
            : null,
        });
      }

      // For regular questions, get response from Claude
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: body.messages,
      });

      const assistantMessage = response.content[0].text;

      res.json({
        agent: { id: agent.id, name: agent.name },
        message: assistantMessage,
        classification,
        action_taken: null,
      });
    } catch (e: any) {
      console.error(`Chat error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Start Job (file upload + spawn processor) ───
  app.post("/api/start-job", upload.single("file"), async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[${timestamp}] START-JOB REQUEST RECEIVED`);
    console.log(`${"=".repeat(60)}`);

    try {
      const file = req.file;
      const rowCount = parseInt(req.body.rowCount || "0", 10);

      console.log(`[STEP 1] File received:`, {
        hasFile: !!file,
        fileName: file?.originalname,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        rowCount,
      });

      if (!file) {
        console.error(`[ERROR] No file in request`);
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileName = file.originalname;
      const filePath = `${Date.now()}_${fileName}`;
      console.log(`[STEP 2] Generated file path: ${filePath}`);

      // Upload file to Supabase Storage
      console.log(
        `[STEP 3] Uploading to Supabase Storage bucket "job-inputs"...`
      );
      const uploadStart = Date.now();
      const { error: uploadError } = await supabase.storage
        .from("job-inputs")
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error(
          `[ERROR] Supabase storage upload failed:`,
          uploadError
        );
        return res.status(500).json({
          error: "Failed to upload file",
          details: uploadError.message,
        });
      }
      console.log(
        `[STEP 3] Upload complete in ${Date.now() - uploadStart}ms`
      );

      // Create job record
      const jobId = randomUUID();
      console.log(`[STEP 4] Generated job ID: ${jobId}`);

      console.log(
        `[STEP 5] Creating job record in Supabase "jobs" table...`
      );
      const insertStart = Date.now();
      const { error: insertError } = await supabase.from("jobs").insert({
        id: jobId,
        status: "pending",
        progress_percent: 0,
        input_file_name: filePath,
        submitted_by: "web-user",
      });

      if (insertError) {
        console.error(`[ERROR] Supabase insert failed:`, insertError);
        return res.status(500).json({
          error: "Failed to create job record",
          details: insertError.message,
        });
      }
      console.log(
        `[STEP 5] Job record created in ${Date.now() - insertStart}ms`
      );

      // Spawn job processor directly (no more proxying to VM)
      console.log(`[STEP 6] Spawning job processor...`);
      const jobProcessorPath = path.resolve(
        REPO_ROOT,
        "agents",
        "ecommerce",
        "capabilities",
        "tech-pack-extraction",
        "job-processor.js"
      );

      const jobProcessor = spawn("node", [jobProcessorPath, jobId], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });

      jobProcessor.unref();
      console.log(
        `[STEP 6] Job processor spawned (pid: ${jobProcessor.pid})`
      );

      console.log(`[COMPLETE] Job ${jobId} created and processor spawned`);
      console.log(`${"=".repeat(60)}\n`);

      return res.json({
        success: true,
        jobId,
        vmTriggered: true,
        message: "Job queued successfully",
      });
    } catch (error: any) {
      console.error(`[FATAL ERROR] Start job failed:`, {
        message: error.message,
        stack: error.stack,
      });
      return res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  });

  // ─── Job Status ───
  app.get("/api/job-status/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const idValidation = uuidSchema.safeParse(id);
      if (!idValidation.success) {
        return res.status(400).json({ error: "Invalid job ID format" });
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Supabase fetch error:", error);
        return res.status(404).json({ error: "Job not found" });
      }

      // Extract clean file name (remove timestamp prefix if present)
      let fileName = data.input_file_name || data.file_name || "Untitled";
      const underscoreIndex = fileName.indexOf("_");
      if (
        underscoreIndex > 0 &&
        /^\d+$/.test(fileName.substring(0, underscoreIndex))
      ) {
        fileName = fileName.substring(underscoreIndex + 1);
      }

      return res.json({
        id: data.id,
        status: data.status,
        progressPercent: data.progress_percent || 0,
        currentStyle: data.current_style || null,
        outputSheetUrl: data.output_sheet_url || null,
        fileName,
        createdAt: data.created_at,
        errorMessage: data.error_message || null,
      });
    } catch (error) {
      console.error("Job status error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Jobs List ───
  app.get("/api/jobs", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Supabase fetch error:", error);
        return res.status(500).json({ error: "Failed to fetch jobs" });
      }

      return res.json(
        data.map((job: any) => {
          let fileName =
            job.input_file_name || job.file_name || "Untitled";
          const underscoreIndex = fileName.indexOf("_");
          if (
            underscoreIndex > 0 &&
            /^\d+$/.test(fileName.substring(0, underscoreIndex))
          ) {
            fileName = fileName.substring(underscoreIndex + 1);
          }
          return {
            id: job.id,
            status: job.status,
            progressPercent: job.progress_percent || 0,
            currentStyle: job.current_style || null,
            outputSheetUrl: job.output_sheet_url || null,
            fileName,
            createdAt: job.created_at,
            errorMessage: job.error_message || null,
          };
        })
      );
    } catch (error) {
      console.error("Jobs list error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Create Google Sheet ───
  app.post("/api/create-google-sheet", async (req, res) => {
    try {
      const { accessToken, jobId } = req.body;

      if (!accessToken || !jobId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log("[Create Sheet] === Starting Google Sheet export ===");
      console.log("[Create Sheet] Job ID:", jobId);

      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("extracted_data, input_file_name")
        .eq("id", jobId)
        .single();

      if (jobError) {
        console.error("[Create Sheet] Supabase error:", jobError);
        return res.status(500).json({
          error: "Failed to fetch job data",
          details: jobError.message,
        });
      }

      const extractedData = jobData?.extracted_data as {
        headers?: string[];
        rows?: Record<string, string>[];
        logicHeaders?: string[];
        logicRows?: string[][];
      } | null;

      // Create the spreadsheet
      const fileName = jobData?.input_file_name || "Export";
      const title = `L'AGENCE Catsy - ${fileName} - ${new Date().toISOString().slice(0, 10)}`;

      const createResponse = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: { title },
            sheets: [{ properties: { title: "Data" } }],
          }),
        }
      );

      if (!createResponse.ok) {
        const err = await createResponse.json();
        console.error("[Create Sheet] Google Sheets create error:", err);
        return res.status(500).json({
          error: err.error?.message || "Failed to create spreadsheet",
        });
      }

      const sheet = await createResponse.json();
      const spreadsheetId = sheet.spreadsheetId;
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      console.log("[Create Sheet] Spreadsheet created:", spreadsheetId);

      // Set public permissions
      const permResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        }
      );

      if (!permResponse.ok) {
        const err = await permResponse.json();
        console.error(
          "[Create Sheet] Failed to set public permissions:",
          err
        );
      }

      // Write data to the Data sheet
      if (extractedData?.headers && extractedData?.rows) {
        const headers = extractedData.headers;
        const sheetRows: string[][] = [headers];

        for (const row of extractedData.rows) {
          sheetRows.push(headers.map((h: string) => row[h] || ""));
        }

        console.log(
          "[Create Sheet] Writing",
          sheetRows.length,
          "rows to Data sheet"
        );

        const updateResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Data!A1?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values: sheetRows }),
          }
        );

        if (!updateResponse.ok) {
          const err = await updateResponse.json();
          console.error(
            "[Create Sheet] Google Sheets update error:",
            err
          );
        }
      }

      // Create Extraction Logic tab if logic data exists
      if (extractedData?.logicHeaders && extractedData?.logicRows) {
        console.log("[Create Sheet] Creating Extraction Logic tab...");

        const addSheetResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [
                {
                  addSheet: {
                    properties: { title: "Extraction Logic" },
                  },
                },
              ],
            }),
          }
        );

        if (addSheetResponse.ok) {
          const logicData: string[][] = [
            extractedData.logicHeaders,
            ...extractedData.logicRows,
          ];

          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Extraction%20Logic!A1?valueInputOption=RAW`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: logicData }),
            }
          );
        }
      }

      // Update job record with sheet URL
      await supabase
        .from("jobs")
        .update({ status: "completed", output_sheet_url: sheetUrl })
        .eq("id", jobId);

      console.log("[Create Sheet] Job updated, returning sheetUrl");
      return res.json({ sheetUrl });
    } catch (error) {
      console.error("[Create Sheet] Error:", error);
      return res
        .status(500)
        .json({ error: "Failed to create Google Sheet" });
    }
  });

  // ─── Google Client ID ───
  app.get("/api/google-client-id", (_req, res) => {
    const clientId = config.googleClientId;
    if (!clientId) {
      return res
        .status(500)
        .json({ error: "Google Client ID not configured" });
    }
    return res.json({ clientId });
  });

  // ─── Field Definitions (direct, no proxy) ───
  app.get("/api/field-definitions", (_req, res) => {
    res.json({
      capability: "tech-pack-extraction",
      fields: getAllFieldDefinitions(),
    });
  });

  // ─── CSV Download ───
  app.get("/api/jobs/:id/csv", async (req, res) => {
    try {
      const jobId = req.params.id;
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("extracted_data, input_file_name, status")
        .eq("id", jobId)
        .single();

      if (jobErr || !job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (
        !job.extracted_data ||
        !job.extracted_data.headers ||
        !job.extracted_data.rows
      ) {
        return res.status(400).json({
          error: "Job has no extracted data yet. Status: " + job.status,
        });
      }

      const { headers, rows } = job.extracted_data;

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const csvLines = [headers.map(escapeCsv).join(",")];
      for (const row of rows) {
        csvLines.push(
          headers.map((h: string) => escapeCsv(row[h] || "")).join(",")
        );
      }
      const csvContent = csvLines.join("\n");

      const filename =
        (job.input_file_name || "export").replace(/\.[^.]+$/, "") +
        "_extracted.csv";

      res.set({
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      res.send(csvContent);
    } catch (e: any) {
      console.error(`CSV export error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
