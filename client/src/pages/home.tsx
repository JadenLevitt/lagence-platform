import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import ChatWidget from "@/components/chat-widget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  ExternalLink,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  ArrowLeft,
  FileDown,
  BookOpen,
  X,
  TrendingUp,
  Users,
  Zap,
  ArrowRight,
  Search,
  Pencil,
  Check,
  Paperclip,
} from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

interface FieldDefinition {
  field_name: string;
  source: string;
  extraction_logic: string;
  examples?: string;
}

interface FieldDefinitionsResponse {
  fields: FieldDefinition[];
}

interface Job {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "ready_for_export";
  progressPercent: number;
  currentStyle: string | null;
  outputSheetUrl: string | null;
  fileName: string;
  createdAt: string;
  errorMessage: string | null;
}

interface ExtractedField {
  field_name: string;
  value: string;
  needs_review: boolean;
}

interface ExtractedStyle {
  style_number: string;
  fields: ExtractedField[];
}

interface ExtractedDataResponse {
  job_id: string;
  status: string;
  file_name: string;
  headers: string[];
  styles: ExtractedStyle[];
}

interface SourceInfo {
  type: string;
  name: string;
  status: string;
  merged: boolean;
  document_type?: string;
  document_id?: string;
}

function SourceBadges({ jobId }: { jobId: string }) {
  const { data } = useQuery<{ sources: SourceInfo[] }>({
    queryKey: ["/api/jobs", jobId, "sources"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/sources`);
      if (!res.ok) throw new Error("Failed to fetch sources");
      return res.json();
    },
    refetchInterval: 15000,
  });

  if (!data?.sources || data.sources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {data.sources.map((source, i) => {
        const isComplete = source.merged && (source.status === "complete" || source.status === "extracted");
        const isProcessing = source.status === "processing" || source.status === "pending";

        let label: string;
        if (source.type === "input_csv") {
          label = "CSV";
        } else if (source.type === "tech_pack") {
          label = "Tech Packs";
        } else if (source.document_type) {
          label = source.document_type.replace(/_/g, " ");
          // Capitalize first letter of each word
          label = label.replace(/\b\w/g, c => c.toUpperCase());
        } else {
          // Use filename without extension
          label = source.name.replace(/\.[^.]+$/, "");
          if (label.length > 20) label = label.substring(0, 18) + "...";
        }

        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium ${
              isComplete
                ? "bg-green-50 text-green-700 border border-green-200"
                : isProcessing
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-gray-50 text-gray-600 border border-gray-200"
            }`}
            title={source.name}
          >
            {isComplete ? <CheckCircle2 className="w-2.5 h-2.5" /> : isProcessing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
            {label}
          </span>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();

  const [exportingJobId, setExportingJobId] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showProductivityGains, setShowProductivityGains] = useState(false);
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ styleNo: string; fieldName: string; originalValue: string } | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [correctedFields, setCorrectedFields] = useState<Set<string>>(new Set());
  const [uploadingSupplementaryJobId, setUploadingSupplementaryJobId] = useState<string | null>(null);
  const supplementaryFileInputRef = useRef<HTMLInputElement>(null);
  const supplementaryTargetJobId = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/google-client-id")
      .then(res => res.json())
      .then(data => setGoogleClientId(data.clientId))
      .catch(err => console.error("Failed to fetch Google Client ID:", err));
  }, []);

  const { data: recentJobs, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000
  });

  const { data: fieldDefinitionsData } = useQuery<FieldDefinitionsResponse>({
    queryKey: ["/api/field-definitions"],
    staleTime: 1000 * 60 * 10
  });
  const fieldDefinitions = fieldDefinitionsData?.fields;

  const { data: extractedData, isLoading: extractedLoading } = useQuery<ExtractedDataResponse>({
    queryKey: ["/api/jobs", reviewingJobId, "extracted"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${reviewingJobId}/extracted`);
      if (!res.ok) throw new Error("Failed to fetch extracted data");
      return res.json();
    },
    enabled: !!reviewingJobId,
  });

  const submitCorrection = async () => {
    if (!editingField || !reviewingJobId) return;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_type: "field_correction",
          field_name: editingField.fieldName,
          original_value: editingField.originalValue,
          corrected_value: correctedValue,
          style_number: editingField.styleNo,
          job_id: reviewingJobId,
          agent_id: "ecommerce",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCorrectedFields(prev => new Set(prev).add(`${editingField.styleNo}:${editingField.fieldName}`));
        setEditingField(null);
        setCorrectedValue("");
        if (data.auto_processed) {
          toast.success("Correction submitted — Emma is learning from your feedback");
        } else {
          toast.success("Correction submitted");
        }
      }
    } catch {
      toast.error("Failed to submit correction");
    }
  };

  const handleSupplementaryUpload = async (files: FileList | null) => {
    const jobId = supplementaryTargetJobId.current;
    if (!files || files.length === 0 || !jobId) return;

    setUploadingSupplementaryJobId(jobId);
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("supplementary", file);
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}/supplementary`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Files added — reprocessing job with new data");
      refetchJobs();
    } catch {
      toast.error("Failed to upload supplementary files");
    } finally {
      setUploadingSupplementaryJobId(null);
      supplementaryTargetJobId.current = null;
      if (supplementaryFileInputRef.current) supplementaryFileInputRef.current.value = "";
    }
  };

  const handleExportToGoogleSheets = async (job: Job) => {
    if (!googleClientId || !job.id) return;
    if (!window.google) {
      alert("Google Sign-In is still loading. Please try again in a moment.");
      return;
    }

    setExportingJobId(job.id);

    // Extract spreadsheet ID from existing URL if present
    const existingSpreadsheetId = job.outputSheetUrl
      ? job.outputSheetUrl.split("/d/")[1]?.split("/")[0]
      : undefined;

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: existingSpreadsheetId
        ? 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
        : 'https://www.googleapis.com/auth/drive.file',
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error("Google sign-in failed:", tokenResponse.error);
          setExportingJobId(null);
          return;
        }

        try {
          const response = await fetch("/api/create-google-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: tokenResponse.access_token,
              jobId: job.id,
              ...(existingSpreadsheetId && { existingSpreadsheetId }),
            })
          });

          if (!response.ok) throw new Error("Failed to export Google Sheet");

          const data = await response.json();
          if (data.sheetUrl) {
            window.open(data.sheetUrl, "_blank");
            refetchJobs();
          }
        } catch (error) {
          console.error("Export failed:", error);
          alert("Failed to export to Google Sheets. Please try again.");
        } finally {
          setExportingJobId(null);
        }
      }
    });

    client.requestAccessToken();

    setTimeout(() => {
      setExportingJobId((current) => current === job.id ? null : current);
    }, 60000);
  };

  const getStatusBadge = (status: string, progressPercent?: number) => {
    const baseClasses = "inline-flex items-center px-2 py-1 text-[10px] font-medium uppercase tracking-widest border";
    switch (status) {
      case "completed":
      case "ready_for_export":
        return null;
      case "processing":
        return <span className={`${baseClasses} border-amber-300 bg-amber-100 text-amber-800`}>{progressPercent || 0}%</span>;
      case "failed":
        return <span className={`${baseClasses} border-red-300 bg-red-100 text-red-800`}>Failed</span>;
      case "pending":
        return <span className={`${baseClasses} border-blue-300 bg-blue-100 text-blue-800`}>Starting</span>;
      default:
        return <span className={`${baseClasses} border-gray-300 bg-gray-100 text-gray-800`}>Queued</span>;
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-white px-8 py-6">
          <button
            onClick={() => setLocation("/ecommerce-agent")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-black transition-colors mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to E-commerce Agent</span>
          </button>
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-serif text-2xl">Prepare Metadata for Catsy</h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInstructions(true)}
                className="rounded-none text-xs uppercase tracking-widest"
                data-testid="button-agent-instructions"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Agent Instructions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProductivityGains(true)}
                className="rounded-none text-xs uppercase tracking-widest"
                data-testid="button-productivity-gains"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Productivity Gains
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Upload CSVs through Emma's chat to start a job, then add supplementary PDFs (tech packs, denim sheets, care instructions) to refine the output.
          </p>
        </div>

        {/* Content: 50/50 split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Jobs Panel */}
          <div className="w-1/2 flex flex-col overflow-hidden border-r border-border">
            <div className="px-6 py-3 border-b border-border bg-white flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Jobs</h2>
              <span className="text-[10px] text-muted-foreground">
                {recentJobs?.length || 0} total
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {(!recentJobs || recentJobs.length === 0) ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No jobs yet</p>
                  <p className="text-xs mt-1">Upload a CSV through Emma's chat to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentJobs.map((job) => (
                    <div key={job.id} className="p-4 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{job.fileName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(job.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getStatusBadge(job.status, job.progressPercent)}
                          {(job.status === "completed" || job.status === "ready_for_export" || job.status === "failed") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs border-border hover:border-black/40"
                              title="Add supplementary files (PDF line sheet or CSV fabric workbook)"
                              disabled={uploadingSupplementaryJobId === job.id}
                              onClick={() => {
                                supplementaryTargetJobId.current = job.id;
                                supplementaryFileInputRef.current?.click();
                              }}
                              data-testid={`button-add-files-${job.id}`}
                            >
                              {uploadingSupplementaryJobId === job.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Paperclip className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                          {(job.status === "completed" || job.status === "ready_for_export") && googleClientId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-xs bg-[#34A853] hover:bg-[#2d9248] text-white border-[#34A853] hover:border-[#2d9248]"
                              onClick={() => {
                                if (exportingJobId !== job.id) {
                                  handleExportToGoogleSheets(job);
                                }
                              }}
                              data-testid={`button-export-${job.id}`}
                            >
                              {exportingJobId === job.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="w-3 h-3 mr-1" />
                              )}
                              {job.outputSheetUrl ? "Republish" : "Sheets"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Source badges */}
                      {(job.status === "completed" || job.status === "ready_for_export" || job.status === "processing") && (
                        <SourceBadges jobId={job.id} />
                      )}

                      {/* Progress bar for active jobs */}
                      {(job.status === "processing" || job.status === "pending") && (
                        <div className="mt-3">
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-black transition-all duration-500"
                              style={{ width: `${job.progressPercent || 0}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {job.status === "pending"
                              ? "Starting... waiting for worker"
                              : job.currentStyle
                                ? `Processing: ${job.currentStyle}`
                                : `${job.progressPercent || 0}% complete`}
                          </p>
                        </div>
                      )}

                      {/* Error message */}
                      {job.status === "failed" && (
                        <p className="text-xs text-red-600 mt-2 break-words">
                          {job.errorMessage?.includes("download")
                            ? "Could not process file. Please try uploading again."
                            : job.errorMessage || "Processing failed. Please try again."}
                        </p>
                      )}

                      {/* Review & Correct panel */}
                      {(job.status === "completed" || job.status === "ready_for_export") && (
                        <div className="mt-2">
                          <button
                            onClick={() => {
                              setReviewingJobId(reviewingJobId === job.id ? null : job.id);
                              setEditingField(null);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-border rounded hover:border-black/40 hover:bg-secondary/50 transition-all"
                          >
                            <Search className="w-3.5 h-3.5" />
                            {reviewingJobId === job.id ? "Hide Review" : "Review & Correct Data"}
                          </button>
                          {reviewingJobId === job.id && (
                            <div className="mt-3 border-t border-border pt-3">
                              {extractedLoading ? (
                                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-xs">Loading extracted data...</span>
                                </div>
                              ) : extractedData?.styles?.length ? (
                                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                  {extractedData.styles.map((style) => (
                                    <div key={style.style_number} className="border border-border/50 bg-secondary/10 p-3">
                                      <p className="text-xs font-medium mb-2 uppercase tracking-wider">{style.style_number}</p>
                                      <div className="space-y-1">
                                        {style.fields.map((field) => {
                                          const fieldKey = `${style.style_number}:${field.field_name}`;
                                          const isCorrected = correctedFields.has(fieldKey);
                                          const isEditing = editingField?.styleNo === style.style_number && editingField?.fieldName === field.field_name;
                                          return (
                                            <div key={field.field_name} className="flex items-start gap-2 text-xs">
                                              <span className="text-muted-foreground w-[140px] flex-shrink-0 truncate" title={field.field_name}>
                                                {field.field_name}
                                              </span>
                                              {isEditing ? (
                                                <div className="flex-1 flex items-center gap-1">
                                                  <input
                                                    type="text"
                                                    value={correctedValue}
                                                    onChange={(e) => setCorrectedValue(e.target.value)}
                                                    className="flex-1 border border-border px-2 py-0.5 text-xs bg-white"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") submitCorrection();
                                                      if (e.key === "Escape") { setEditingField(null); setCorrectedValue(""); }
                                                    }}
                                                  />
                                                  <button onClick={submitCorrection} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                                                    <Check className="w-3 h-3" />
                                                  </button>
                                                  <button onClick={() => { setEditingField(null); setCorrectedValue(""); }} className="p-0.5 text-muted-foreground hover:bg-secondary rounded">
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <div className="flex-1 flex items-center gap-1 group">
                                                  <span className={`${field.needs_review ? "text-amber-600" : ""} ${isCorrected ? "line-through text-muted-foreground" : ""}`}>
                                                    {field.value || <span className="italic text-muted-foreground/50">empty</span>}
                                                  </span>
                                                  {isCorrected ? (
                                                    <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                                                  ) : (
                                                    <button
                                                      onClick={() => {
                                                        setEditingField({ styleNo: style.style_number, fieldName: field.field_name, originalValue: field.value });
                                                        setCorrectedValue(field.value);
                                                      }}
                                                      className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-black transition-all flex-shrink-0"
                                                      title="Correct this value"
                                                    >
                                                      <Pencil className="w-3 h-3" />
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">No extracted data available</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Chat Panel */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <ChatWidget agentName="ecommerce" agentTitle="Emma" fullWidth />
          </div>
        </div>
      </div>

      {/* Agent Instructions Modal */}
      <AnimatePresence>
      {showInstructions && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowInstructions(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-serif text-2xl">Agent Instructions</h2>
              <button
                onClick={() => setShowInstructions(false)}
                className="p-2 hover:bg-secondary rounded-sm transition-colors"
                data-testid="button-close-instructions"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <p className="text-muted-foreground text-sm mb-6">
                The e-commerce agent extracts the following fields from Gerber tech packs and populates them in your export:
              </p>
              {fieldDefinitions && fieldDefinitions.length > 0 ? (
                <div className="space-y-4">
                  {fieldDefinitions.map((field, index) => (
                    <div key={index} className="border border-border p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium">{field.field_name}</h3>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {field.source.replace('_', ' ')}
                        </Badge>
                      </div>
                      {field.extraction_logic && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {field.extraction_logic}
                        </p>
                      )}
                      {field.examples && (
                        <div className="text-xs text-muted-foreground bg-secondary/50 p-2 font-mono">
                          <span className="opacity-60">Examples: </span>
                          {field.examples}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No field definitions available.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Productivity Gains Modal */}
      <AnimatePresence>
      {showProductivityGains && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowProductivityGains(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="font-serif text-2xl">Productivity Gains</h2>
                <p className="text-sm text-muted-foreground mt-1">How Emma transforms the metadata enrichment workflow</p>
              </div>
              <button
                onClick={() => setShowProductivityGains(false)}
                className="p-2 hover:bg-secondary rounded-sm transition-colors"
                data-testid="button-close-productivity"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Before Column */}
                <div className="border border-border p-6 bg-secondary/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl">Before</h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Manual Process</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="border-l-2 border-muted pl-4">
                      <h4 className="font-medium mb-2">Cross-Team Collaboration Required</h4>
                      <p className="text-muted-foreground">
                        E-commerce, Production, and Editorial teams worked together to manually create enriched metadata Google Sheets for Shopify upload.
                      </p>
                    </div>

                    <div className="border-l-2 border-muted pl-4">
                      <h4 className="font-medium mb-2">Time-Intensive Tech Pack Review</h4>
                      <p className="text-muted-foreground">
                        Starting with 300 SKUs from Full Circle, team members manually navigated Gerber PLM tech packs one by one—just finding each tech pack took 1-2 minutes per style.
                      </p>
                    </div>

                    <div className="border-l-2 border-muted pl-4">
                      <h4 className="font-medium mb-2">Manual Data Requests</h4>
                      <p className="text-muted-foreground">
                        Production team was contacted for specific spreadsheets and detailed product information not available in standard views.
                      </p>
                    </div>

                    <div className="border-l-2 border-muted pl-4">
                      <h4 className="font-medium mb-2">Subjective Classification</h4>
                      <p className="text-muted-foreground">
                        Team used best judgment to visually inspect silhouettes and classify items—necessary for search and SEO specificity that improves sales.
                      </p>
                    </div>

                    <div className="mt-6 p-4 bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Result</p>
                      <p className="font-medium">Multiple team members, hours of work per batch</p>
                    </div>
                  </div>
                </div>

                {/* After Column */}
                <div className="border border-black p-6 bg-white">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl">After</h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Emma Agent</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="border-l-2 border-black pl-4">
                      <h4 className="font-medium mb-2">Same Input, Automated Output</h4>
                      <p className="text-muted-foreground">
                        Takes the same Full Circle input file and uses read-only access to Gerber to review tech packs automatically.
                      </p>
                    </div>

                    <div className="border-l-2 border-black pl-4">
                      <h4 className="font-medium mb-2">Visual Inspection at Scale</h4>
                      <p className="text-muted-foreground">
                        Emma visually inspects tech pack documents, makes intelligent judgment calls on classifications, and extracts all relevant data.
                      </p>
                    </div>

                    <div className="border-l-2 border-black pl-4">
                      <h4 className="font-medium mb-2">Complete Catsy-Ready Output</h4>
                      <p className="text-muted-foreground">
                        Populates the full 300 SKUs × 23 columns spreadsheet ready for direct Catsy upload—with full extraction logic transparency.
                      </p>
                    </div>

                    <div className="border-l-2 border-black pl-4">
                      <h4 className="font-medium mb-2">Future: Agent-to-Agent</h4>
                      <p className="text-muted-foreground">
                        Currently Emma doesn't reach out to Production for details, but she's capable. Future state: Emma talks directly to the Production Agent for additional context.
                      </p>
                    </div>

                    <div className="mt-6 p-4 bg-black text-white text-center">
                      <p className="text-xs uppercase tracking-wider mb-1 opacity-70">Result</p>
                      <p className="font-medium">10-20% of the cost, near-zero time investment</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Bottom Summary */}
              <div className="mt-8 p-6 border border-border bg-secondary/5 text-center">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="text-right">
                    <p className="text-2xl font-serif">Multiple Teams</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">One batch at a time</p>
                  </div>
                  <ArrowRight className="w-8 h-8 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-2xl font-serif">One Agent</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Scales concurrently</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-4">
                  The same level of metadata specificity that drives search and sales—now automated, scalable, and able to process multiple batches concurrently while your team focuses on higher-value work.
                </p>
                <a
                  href="https://docs.google.com/spreadsheets/d/1uyk_wcr8aYABy_yhjCtt6_uhT0AcSOjNFl-j8pq8BaU/edit?gid=73702239#gid=73702239"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium underline hover:text-black/70 transition-colors"
                  data-testid="link-example-output"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Example Output
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Hidden file input for supplementary uploads */}
      <input
        ref={supplementaryFileInputRef}
        type="file"
        accept=".pdf,.csv"
        multiple
        className="hidden"
        onChange={(e) => handleSupplementaryUpload(e.target.files)}
      />
    </Layout>
  );
}
