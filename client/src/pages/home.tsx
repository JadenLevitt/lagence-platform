import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import ChatWidget from "@/components/chat-widget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Upload, 
  CheckCircle2, 
  ExternalLink, 
  Clock, 
  AlertCircle,
  FileSpreadsheet,
  Plus,
  ArrowLeft,
  FileDown,
  BookOpen,
  X,
  TrendingUp,
  Users,
  Zap,
  ArrowRight
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

interface JobResponse {
  success: boolean;
  jobId: string;
  message: string;
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

export default function Home() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const jobIdFromUrl = urlParams.get("job");
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "processing">(
    jobIdFromUrl ? "processing" : "idle"
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobIdFromUrl);
  const [exportingJobId, setExportingJobId] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showProductivityGains, setShowProductivityGains] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/google-client-id")
      .then(res => res.json())
      .then(data => setGoogleClientId(data.clientId))
      .catch(err => console.error("Failed to fetch Google Client ID:", err));
  }, []);
  
  useEffect(() => {
    if (jobIdFromUrl && jobIdFromUrl !== currentJobId) {
      setCurrentJobId(jobIdFromUrl);
      setUploadState("processing");
    }
  }, [jobIdFromUrl]);

  const { data: recentJobs, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000
  });

  const { data: fieldDefinitionsData } = useQuery<FieldDefinitionsResponse>({
    queryKey: ["/api/field-definitions"],
    staleTime: 1000 * 60 * 10 // Cache for 10 minutes
  });
  const fieldDefinitions = fieldDefinitionsData?.fields;

  const { data: currentJob } = useQuery<Job>({
    queryKey: ["/api/job-status", currentJobId],
    enabled: !!currentJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
        refetchJobs();
        return false;
      }
      return 3000;
    }
  });

  const startJobMutation = useMutation({
    mutationFn: async ({ file, rowCount }: { file: File; rowCount: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('rowCount', rowCount.toString());
      
      const response = await fetch("/api/start-job", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to start job");
      }
      
      return response.json() as Promise<JobResponse>;
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      setUploadState("processing");
      refetchJobs();
    },
    onError: (error) => {
      console.error("Failed to start job:", error);
      setUploadState("idle");
    }
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    if (!isCsv && !isPdf) {
      alert("Please upload a CSV or PDF file");
      return;
    }

    // Handle PDF uploads — send to documents endpoint
    if (isPdf) {
      setSelectedFile(file);
      setUploadState("uploading");
      try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) throw new Error("Failed to upload PDF");

        const uploadData = await uploadRes.json();

        // Trigger extraction
        await fetch(`/api/documents/${uploadData.document.id}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        alert(`PDF "${file.name}" uploaded and extraction started. Check the chat for results.`);
        setUploadState("idle");
        setSelectedFile(null);
      } catch (err) {
        console.error("PDF upload failed:", err);
        alert("Failed to upload PDF. Please try again.");
        setUploadState("idle");
        setSelectedFile(null);
      }
      return;
    }

    // Handle CSV uploads — existing flow
    setSelectedFile(file);
    setUploadState("uploading");

    const text = await file.text();
    const lines = text.trim().split('\n');
    const rowCount = Math.max(0, lines.length - 1);

    startJobMutation.mutate({
      file,
      rowCount
    });
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleUploadAnother = () => {
    setUploadState("idle");
    setSelectedFile(null);
    setCurrentJobId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExportToGoogleSheets = async (jobId: string) => {
    console.log('[Export] Google Sheets button clicked for job:', jobId);
    console.log('[Export] Google Client ID present:', !!googleClientId);
    console.log('[Export] window.google present:', !!window.google);
    
    if (!googleClientId || !jobId) {
      console.log('[Export] Missing googleClientId or jobId, aborting');
      return;
    }
    if (!window.google) {
      console.log('[Export] Google SDK not loaded yet');
      alert("Google Sign-In is still loading. Please try again in a moment.");
      return;
    }

    setExportingJobId(jobId);
    console.log('[Export] Starting OAuth flow...');

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: async (tokenResponse) => {
        console.log('[Export] OAuth callback received');
        if (tokenResponse.error) {
          console.error("[Export] Google sign-in failed:", tokenResponse.error);
          setExportingJobId(null);
          return;
        }

        console.log('[Export] OAuth success, token received. Calling /api/create-google-sheet...');
        try {
          const response = await fetch("/api/create-google-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: tokenResponse.access_token,
              jobId: jobId
            })
          });

          console.log('[Export] API response status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Export] API error response:', errorText);
            throw new Error("Failed to create Google Sheet");
          }

          const data = await response.json();
          console.log('[Export] API response data:', data);
          
          if (data.sheetUrl) {
            console.log('[Export] Success! Opening sheet:', data.sheetUrl);
            window.open(data.sheetUrl, "_blank");
            refetchJobs();
          }
        } catch (error) {
          console.error("[Export] Export failed:", error);
          alert("Failed to export to Google Sheets. Please try again.");
        } finally {
          setExportingJobId(null);
        }
      }
    });

    console.log('[Export] Requesting access token...');
    client.requestAccessToken();
    
    // Reset exporting state after timeout if popup was closed without completing
    setTimeout(() => {
      setExportingJobId((current) => current === jobId ? null : current);
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
      <div className="flex-1 flex h-full overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-border bg-white px-12 py-8">
          <button 
            onClick={() => setLocation("/ecommerce-agent")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-black transition-colors mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to E-commerce Agent</span>
          </button>
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-serif text-3xl">Prepare Metadata for Catsy</h1>
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
            Upload a .csv file (<a href="https://docs.google.com/spreadsheets/d/1BJ_EOCmSlEDRkbarwD6MKWIGmepE3_gplY4XIhuidkU/edit?gid=0#gid=0" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">template here</a>) and the e-commerce agent will fill out all of the columns by checking the tech packs in Gerber.
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              
              <div>
                <h2 className="font-serif text-xl mb-6">Upload Product File</h2>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />

                <AnimatePresence mode="wait">
                  {uploadState === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full"
                    >
                      <div 
                        className={`
                          border border-dashed transition-all duration-300
                          flex flex-col items-center justify-center
                          py-16 px-8 text-center cursor-pointer group
                          ${isDragging ? "border-black bg-secondary" : "border-border bg-card hover:border-black/30"}
                        `}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={handleClickUpload}
                        data-testid="dropzone-upload"
                      >
                        <div className="mb-6 p-3 rounded-full bg-secondary text-primary">
                          <Upload className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        
                        <p className="font-medium mb-2">Drop your CSV or PDF here</p>
                        <p className="text-sm text-muted-foreground">or click to browse</p>
                        
                        <Button 
                          variant="outline" 
                          className="mt-6 rounded-none border-black/10 hover:bg-black hover:text-white text-xs uppercase tracking-widest"
                          data-testid="button-select-csv"
                        >
                          Select File
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {uploadState === "uploading" && (
                    <motion.div
                      key="uploading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border border-border bg-card p-8"
                    >
                      <div className="flex items-center gap-4">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        <div>
                          <p className="font-medium">Uploading...</p>
                          <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {uploadState === "processing" && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border border-border bg-card p-8"
                    >
                      <div className="flex items-start gap-4 mb-6">
                        {currentJob?.status === "completed" ? (
                          <div className="p-2 bg-green-600 text-white rounded-sm">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : currentJob?.status === "failed" ? (
                          <div className="p-2 bg-red-600 text-white rounded-sm">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-2 bg-black text-white rounded-sm">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{selectedFile?.name || currentJob?.fileName}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {currentJob?.status === "completed" && "Processing complete! Your Google Sheet is ready."}
                            {currentJob?.status === "failed" && (
                              currentJob.errorMessage?.includes("download") 
                                ? "Could not process file. Please try uploading again."
                                : currentJob.errorMessage || "Processing failed. Please try again."
                            )}
                            {currentJob?.status === "processing" && `Creating Google Sheet... ${currentJob.progressPercent || 0}%`}
                            {currentJob?.status === "pending" && "Queued for processing..."}
                            {!currentJob && "Starting..."}
                          </p>
                        </div>
                        {getStatusBadge(currentJob?.status || "pending", currentJob?.progressPercent)}
                      </div>

                      {currentJob?.status === "completed" && currentJob.outputSheetUrl && (
                        <Button 
                          className="w-full rounded-none h-11 text-xs uppercase tracking-widest bg-black text-white hover:bg-black/90 mb-3"
                          onClick={() => window.open(currentJob.outputSheetUrl!, "_blank")}
                          data-testid="button-open-sheet"
                        >
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Open Google Sheet
                        </Button>
                      )}

                      <Button 
                        variant="outline"
                        className="w-full rounded-none h-11 text-xs uppercase tracking-widest"
                        onClick={handleUploadAnother}
                        data-testid="button-upload-another"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Upload Another File
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <h2 className="font-serif text-xl mb-6">Jobs</h2>
                
                <div className="border border-border bg-card overflow-hidden">
                  {(!recentJobs || recentJobs.length === 0) ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No jobs yet</p>
                      <p className="text-xs mt-1">Upload a file to get started</p>
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <div className="divide-y divide-border">
                        {recentJobs.map((job) => (
                          <div key={job.id} className="p-4 hover:bg-secondary/30 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{job.fileName}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(job.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex items-center justify-end flex-shrink-0 min-w-[100px]">
                                {getStatusBadge(job.status, job.progressPercent)}
                                {job.status === "completed" && job.outputSheetUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-3 text-xs bg-[#34A853] hover:bg-[#2d9248] text-white border-[#34A853] hover:border-[#2d9248]"
                                    onClick={() => window.open(job.outputSheetUrl!, "_blank")}
                                    data-testid={`button-open-sheet-${job.id}`}
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    Open
                                  </Button>
                                )}
                                {(job.status === "ready_for_export" || (job.status === "completed" && !job.outputSheetUrl)) && googleClientId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-3 text-xs bg-[#34A853] hover:bg-[#2d9248] text-white border-[#34A853] hover:border-[#2d9248]"
                                    onClick={() => {
                                      if (exportingJobId === job.id) {
                                        setExportingJobId(null);
                                      } else {
                                        handleExportToGoogleSheets(job.id);
                                      }
                                    }}
                                    data-testid={`button-export-${job.id}`}
                                  >
                                    {exportingJobId === job.id ? (
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    ) : (
                                      <FileDown className="w-3 h-3 mr-1" />
                                    )}
                                    Sheets
                                  </Button>
                                )}
                              </div>
                            </div>
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
                            {job.status === "failed" && (
                              <p className="text-xs text-red-600 mt-2 break-words">
                                {job.errorMessage?.includes("download") 
                                  ? "Could not process file. Please try uploading again."
                                  : job.errorMessage || "Processing failed. Please try again."}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
      </div>
      <ChatWidget agentName="emma" agentTitle="Emma" />
    </div>
    </Layout>
  );
}
