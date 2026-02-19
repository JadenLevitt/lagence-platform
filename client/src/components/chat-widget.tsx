import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, ThumbsUp, ThumbsDown, Paperclip, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  feedbackGiven?: "up" | "down" | null;
  attachedDocument?: { id: string; fileName: string } | null;
}

export default function ChatWidget({
  agentName = "emma",
  agentTitle = "Emma",
  apiUrl = ""
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I'm ${agentTitle}, your e-commerce assistant. How can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const sendMessage = async () => {
    if ((!input.trim() && !pendingFile) || isLoading) return;

    const messageText = input.trim() || `I've uploaded ${pendingFile?.name}. Can you extract data from it?`;
    let attachedDoc: Message["attachedDocument"] = null;

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
      if (pendingFile) {
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
      }

      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      if (attachedDoc) {
        chatHistory.push({
          role: "user",
          content: `[System: Document "${attachedDoc.fileName}" uploaded and extraction started. Document ID: ${attachedDoc.id}]`
        });
      }

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

  return (
    <div className="w-80 border-l border-border bg-white flex flex-col h-full">
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
                {message.content}
              </div>
            </div>
            {message.role === "assistant" && message.id !== "welcome" && (
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
        <div className="border-t border-border px-4 py-2 flex items-center gap-2 bg-secondary/50">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1 truncate">{pendingFile.name}</span>
          <button
            onClick={() => setPendingFile(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
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
            placeholder="Ask Emma anything..."
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
