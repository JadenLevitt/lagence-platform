import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, ThumbsUp, ThumbsDown, Paperclip, FileText, Loader2, Pencil, Check, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

declare global {
  interface Window {
    LAGENCE_CHAT_CONFIG?: {
      apiUrl: string;
    };
  }
}

interface ChatWidgetProps {
  agentName?: string;
  agentTitle?: string;
  apiUrl?: string;
  fullWidth?: boolean;
}

interface ExtractionField {
  key: string;
  value: string;
}

interface JobOption {
  id: string;
  fileName: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  feedbackGiven?: "up" | "down" | null;
  attachedDocument?: { id: string; fileName: string } | null;
  extractionData?: {
    documentId: string;
    documentType: string;
    fields: ExtractionField[];
    mergedToJob?: string;
  } | null;
  extractionStatus?: "extracting" | "complete" | "merging" | "merged" | "failed";
}

export default function ChatWidget({
  agentName = "ecommerce",
  agentTitle = "Emma",
  apiUrl = "",
  fullWidth = false
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I'm ${agentTitle}, your e-commerce assistant. Upload a PDF to extract data, or ask me anything about your jobs.`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingField, setEditingField] = useState<{ docId: string; fieldKey: string; originalValue: string } | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [correctedFields, setCorrectedFields] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [availableJobs, setAvailableJobs] = useState<JobOption[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedJobRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedJobRef.current = selectedJobId;
  }, [selectedJobId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Fetch available jobs when file is pending
  useEffect(() => {
    if (pendingFile) {
      fetch(`${apiUrl}/api/jobs`)
        .then(res => res.json())
        .then((jobs: any[]) => {
          const eligible = jobs.filter((j: any) =>
            j.status === "completed" || j.status === "ready_for_export"
          );
          setAvailableJobs(eligible.map((j: any) => ({ id: j.id, fileName: j.fileName })));
          if (eligible.length > 0) setSelectedJobId(eligible[0].id);
        })
        .catch(err => console.error("Failed to fetch jobs:", err));
    } else {
      setAvailableJobs([]);
      setSelectedJobId(null);
    }
  }, [pendingFile, apiUrl]);

  const submitFeedback = async (messageId: string, rating: "up" | "down") => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, feedbackGiven: rating } : m
      )
    );

    const msgIndex = messages.findIndex(m => m.id === messageId);
    const chatContext = {
      assistant_message: messages[msgIndex]?.content,
      user_message: msgIndex > 0 ? messages[msgIndex - 1]?.content : null,
    };

    try {
      await fetch(`${apiUrl}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_type: "response_rating",
          rating: rating === "up" ? 5 : 1,
          agent_id: agentName,
          chat_context: chatContext,
        }),
      });
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  };

  const submitFieldCorrection = async () => {
    if (!editingField || !correctedValue.trim()) return;

    try {
      const res = await fetch(`${apiUrl}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_type: "field_correction",
          field_name: editingField.fieldKey,
          original_value: editingField.originalValue,
          corrected_value: correctedValue,
          document_id: editingField.docId,
          agent_id: agentName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCorrectedFields(prev => new Set(prev).add(`${editingField.docId}:${editingField.fieldKey}`));
        setEditingField(null);
        setCorrectedValue("");
        toast.success(
          data.auto_processed
            ? "Correction submitted — Emma is learning from your feedback."
            : "Correction submitted"
        );
      }
    } catch (error) {
      console.error("Failed to submit correction:", error);
      toast.error("Failed to submit correction");
    }
  };

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("Only PDF files are supported for document upload");
        return;
      }
      setPendingFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadDocument = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedJobRef.current) {
        formData.append("job_id", selectedJobRef.current);
      }

      const uploadRes = await fetch(`${apiUrl}/api/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload document");

      const uploadData = await uploadRes.json();
      const docId = uploadData.document.id;

      // Trigger extraction in background
      fetch(`${apiUrl}/api/documents/${docId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(err => console.error("Background extraction error:", err));

      return { id: docId, fileName: file.name };
    } finally {
      setIsUploading(false);
    }
  };

  const startExtractionPolling = (docId: string, messageId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    let attempts = 0;
    const maxAttempts = 30; // 30 * 3s = 90s timeout

    pollingRef.current = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch(`${apiUrl}/api/documents/${docId}`);
        if (!res.ok) return;

        const doc = await res.json();

        if (doc.status === "extracted" && doc.extracted_data) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;

          // Parse extracted_data into flat key/value pairs
          const fields: ExtractionField[] = [];
          const data = doc.extracted_data;
          if (typeof data === "object" && data !== null) {
            for (const [key, val] of Object.entries(data)) {
              if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
                fields.push({ key, value: String(val) });
              } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
                for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
                  fields.push({ key: `${key} > ${subKey}`, value: String(subVal ?? "") });
                }
              } else if (Array.isArray(val)) {
                fields.push({ key, value: val.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ") });
              }
            }
          }

          // Auto-merge if a job was selected
          const jobId = selectedJobRef.current;
          if (jobId) {
            setMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? {
                      ...m,
                      content: `Extracted ${fields.length} fields. Merging into job...`,
                      extractionStatus: "merging" as const,
                      extractionData: {
                        documentId: docId,
                        documentType: doc.document_type || "general",
                        fields,
                      },
                    }
                  : m
              )
            );

            try {
              await fetch(`${apiUrl}/api/documents/${docId}/merge/${jobId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });

              setMessages(prev =>
                prev.map(m =>
                  m.id === messageId
                    ? {
                        ...m,
                        content: `Extracted ${fields.length} fields from ${doc.file_name} and merged into job.`,
                        extractionStatus: "merged" as const,
                        extractionData: {
                          ...m.extractionData!,
                          mergedToJob: jobId,
                        },
                      }
                    : m
                )
              );
            } catch (mergeErr) {
              console.error("Auto-merge failed:", mergeErr);
              setMessages(prev =>
                prev.map(m =>
                  m.id === messageId
                    ? {
                        ...m,
                        content: `Extracted ${fields.length} fields from ${doc.file_name}. Auto-merge failed — you can merge manually.`,
                        extractionStatus: "complete" as const,
                      }
                    : m
                )
              );
            }
          } else {
            setMessages(prev =>
              prev.map(m =>
                m.id === messageId
                  ? {
                      ...m,
                      content: `Extracted ${fields.length} fields from ${doc.file_name}`,
                      extractionStatus: "complete" as const,
                      extractionData: {
                        documentId: docId,
                        documentType: doc.document_type || "general",
                        fields,
                      },
                    }
                  : m
              )
            );
          }
          return;
        }

        if (doc.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;

          setMessages(prev =>
            prev.map(m =>
              m.id === messageId
                ? {
                    ...m,
                    content: `Extraction failed: ${doc.error_message || "Unknown error"}`,
                    extractionStatus: "failed" as const,
                  }
                : m
            )
          );
          return;
        }
      } catch (err) {
        console.error("Polling error:", err);
      }

      if (attempts >= maxAttempts) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;

        setMessages(prev =>
          prev.map(m =>
            m.id === messageId
              ? {
                  ...m,
                  content: "Extraction is taking longer than expected. Check back in a moment.",
                  extractionStatus: "failed" as const,
                }
              : m
          )
        );
      }
    }, 3000);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pendingFile) || isLoading) return;

    const hasPendingFile = !!pendingFile;
    const messageText = input.trim() || `Uploaded ${pendingFile?.name}${selectedJobId ? " — linking to job" : ""}`;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
      attachedDocument: pendingFile ? { id: "", fileName: pendingFile.name } : null,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Handle file upload
      if (hasPendingFile && pendingFile) {
        let attachedDoc: { id: string; fileName: string } | null = null;
        try {
          attachedDoc = await uploadDocument(pendingFile);
          setMessages(prev =>
            prev.map(m =>
              m.id === userMessage.id ? { ...m, attachedDocument: attachedDoc } : m
            )
          );
        } catch {
          const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "I had trouble uploading that document. Could you try again?",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
          setPendingFile(null);
          setIsLoading(false);
          return;
        }
        setPendingFile(null);

        const extractionMsgId = (Date.now() + 1).toString();
        const extractionMsg: Message = {
          id: extractionMsgId,
          role: "assistant",
          content: `Extracting data from ${attachedDoc.fileName}...`,
          timestamp: new Date(),
          extractionStatus: "extracting",
        };
        setMessages(prev => [...prev, extractionMsg]);
        setIsLoading(false);

        startExtractionPolling(attachedDoc.id, extractionMsgId);
        return;
      }

      // For text-only messages: send to chat API
      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          agent_id: agentName
        })
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.message || data.response || data.content || "I'm sorry, I couldn't process that request.";
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: responseText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: errorData.error || "I'm having trouble connecting right now. Please try again.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Chat network error:", error);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderExtractionCard = (message: Message) => {
    if (!message.extractionData) return null;
    const { documentId, documentType, fields, mergedToJob } = message.extractionData;

    return (
      <div className="mt-2 border border-border/50 bg-white rounded text-xs">
        <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider font-medium bg-black text-white px-1.5 py-0.5">
            {documentType.replace(/_/g, " ")}
          </span>
          <span className="text-muted-foreground">{fields.length} fields</span>
          {mergedToJob && (
            <span className="text-[9px] uppercase tracking-wider font-medium bg-green-600 text-white px-1.5 py-0.5">
              Merged
            </span>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto divide-y divide-border/30">
          {fields.map((field) => {
            const fieldKey = `${documentId}:${field.key}`;
            const isCorrected = correctedFields.has(fieldKey);
            const isEditing = editingField?.docId === documentId && editingField?.fieldKey === field.key;

            return (
              <div key={field.key} className="flex items-start gap-2 px-3 py-1.5">
                <span className="text-muted-foreground w-[120px] flex-shrink-0 truncate" title={field.key}>
                  {field.key}
                </span>
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="text"
                      value={correctedValue}
                      onChange={(e) => setCorrectedValue(e.target.value)}
                      className="flex-1 border border-border px-1.5 py-0.5 text-xs bg-white rounded"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitFieldCorrection();
                        if (e.key === "Escape") { setEditingField(null); setCorrectedValue(""); }
                      }}
                    />
                    <button onClick={submitFieldCorrection} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => { setEditingField(null); setCorrectedValue(""); }} className="p-0.5 text-muted-foreground hover:bg-secondary rounded">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-1 group min-w-0">
                    <span className={`truncate ${isCorrected ? "line-through text-muted-foreground" : ""}`} title={field.value}>
                      {field.value || <span className="italic text-muted-foreground/50">empty</span>}
                    </span>
                    {isCorrected ? (
                      <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingField({ docId: documentId, fieldKey: field.key, originalValue: field.value });
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
    );
  };

  return (
    <div className={`flex flex-col h-full bg-white ${fullWidth ? "" : "w-80 border-l border-border"}`}>
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-medium">{agentTitle}</h3>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">E-Commerce Agent</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-black text-white"
                    : "bg-secondary text-foreground"
                }`}
              >
                {message.attachedDocument && (
                  <div className="flex items-center gap-1.5 mb-1 text-xs opacity-80">
                    <FileText className="w-3 h-3" />
                    <span>{message.attachedDocument.fileName}</span>
                  </div>
                )}
                {message.extractionStatus === "extracting" || message.extractionStatus === "merging" ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{message.content}</span>
                  </div>
                ) : (
                  <span>{message.content}</span>
                )}
                {(message.extractionStatus === "complete" || message.extractionStatus === "merged") && renderExtractionCard(message)}
              </div>
            </div>
            {message.role === "assistant" && message.id !== "welcome" && !message.extractionData && !message.extractionStatus && (
              <div className="flex gap-1 mt-1 ml-1">
                <button
                  onClick={() => submitFeedback(message.id, "up")}
                  className={`p-1 rounded transition-colors ${
                    message.feedbackGiven === "up"
                      ? "text-green-600 bg-green-50"
                      : "text-muted-foreground/40 hover:text-green-600 hover:bg-green-50"
                  }`}
                  disabled={!!message.feedbackGiven}
                  title="Helpful"
                >
                  <ThumbsUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => submitFeedback(message.id, "down")}
                  className={`p-1 rounded transition-colors ${
                    message.feedbackGiven === "down"
                      ? "text-red-600 bg-red-50"
                      : "text-muted-foreground/40 hover:text-red-600 hover:bg-red-50"
                  }`}
                  disabled={!!message.feedbackGiven}
                  title="Not helpful"
                >
                  <ThumbsDown className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-lg px-3 py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">
                {isUploading ? "Uploading document..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {pendingFile && (
        <div className="border-t border-border px-4 py-2 bg-secondary/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground flex-1 truncate">{pendingFile.name}</span>
            <button
              onClick={() => setPendingFile(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
          {availableJobs.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">Link to job:</span>
              <div className="relative flex-1">
                <select
                  value={selectedJobId || ""}
                  onChange={(e) => setSelectedJobId(e.target.value || null)}
                  className="w-full text-xs border border-border px-2 py-1.5 bg-white appearance-none pr-6 truncate"
                >
                  <option value="">None (standalone extraction)</option>
                  {availableJobs.map(job => (
                    <option key={job.id} value={job.id}>{job.fileName}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelected}
          className="hidden"
        />
        <div className="flex gap-2">
          <button
            onClick={handleFileAttach}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Attach PDF"
            disabled={isLoading}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask ${agentTitle} anything...`}
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
            disabled={isLoading}
          />
          <Button
            size="sm"
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingFile) || isLoading}
            className="bg-black hover:bg-black/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
