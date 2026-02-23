import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import Layout from "@/components/layout";
import ChatWidget from "@/components/chat-widget";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileSpreadsheet,
  Sparkles,
  Tags,
  Image,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  Bell,
  ShoppingBag
} from "lucide-react";

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

const capabilities = [
  {
    id: "catsy-metadata",
    title: "Create Enriched Metadata for Catsy",
    description: "Upload product CSV files to generate enriched metadata ready for Catsy import",
    icon: FileSpreadsheet,
    href: "/ecommerce-agent/Catsy-Metadata",
    active: true
  },
  {
    id: "product-descriptions",
    title: "Generate Product Descriptions",
    description: "Create compelling, SEO-optimized product descriptions from basic product data",
    icon: Sparkles,
    href: null,
    active: false
  },
  {
    id: "auto-tagging",
    title: "Automatic Product Tagging",
    description: "Intelligently categorize and tag products based on attributes and images",
    icon: Tags,
    href: null,
    active: false
  },
  {
    id: "image-analysis",
    title: "Product Image Analysis",
    description: "Extract color, style, and attribute data from product photography",
    icon: Image,
    href: null,
    active: false
  }
];

const learningWishlist = [
  {
    id: 1,
    title: "Bulk SEO optimization",
    description: "Optimize all product titles and meta descriptions for search engines"
  },
  {
    id: 2,
    title: "Competitor price monitoring",
    description: "Track competitor pricing and suggest adjustments"
  },
  {
    id: 3,
    title: "Inventory forecasting",
    description: "Predict stock needs based on sales trends and seasonality"
  }
];

export default function Results() {
  const [, setLocation] = useLocation();

  const { data: recentJobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000
  });

  const activeJobs = recentJobs?.filter(
    job => job.status === "pending" || job.status === "processing"
  ) || [];

  const getStatusBadge = (status: string, progressPercent?: number) => {
    const baseClasses = "inline-flex items-center px-2 py-1 text-[10px] font-medium uppercase tracking-widest border";
    switch (status) {
      case "processing":
        return <span className={`${baseClasses} border-amber-300 bg-amber-100 text-amber-800`}>{progressPercent || 0}%</span>;
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
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-black transition-colors mb-6"
              data-testid="button-back-to-agents"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to L'AGENCE Agents</span>
            </button>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-sm bg-black flex items-center justify-center">
                <ShoppingBag className="w-7 h-7 text-white stroke-[1.5]" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Agent</p>
                <h1 className="font-serif text-3xl">E-commerce</h1>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mt-4 max-w-2xl">
              Managing product data enrichment, catalog optimization, and e-commerce workflows for L'AGENCE.
            </p>
          </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              
              <div className="flex flex-col justify-center">
                <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-6">Capabilities</h2>
                <div className="grid grid-cols-1 gap-4">
                  {capabilities.map((capability) => {
                    const Icon = capability.icon;
                    return (
                      <motion.div
                        key={capability.id}
                        whileHover={capability.active ? { y: -2 } : {}}
                        className={`
                          p-8 border transition-all
                          ${capability.active 
                            ? "border-border bg-white cursor-pointer hover:border-black/30 hover:shadow-lg" 
                            : "border-border/50 bg-secondary/20 opacity-50 cursor-not-allowed"
                          }
                        `}
                        onClick={() => capability.active && capability.href && setLocation(capability.href)}
                        data-testid={`capability-${capability.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-4 ${capability.active ? "bg-black text-white" : "bg-secondary text-muted-foreground"}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{capability.title}</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">{capability.description}</p>
                            {!capability.active && (
                              <span className="inline-block mt-3 text-[9px] uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5">
                                Coming Soon
                              </span>
                            )}
                          </div>
                          {capability.active && (
                            <ArrowRight className="w-5 h-5 text-muted-foreground mt-1" />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Notifications</h2>
                </div>
                
                <div className="border border-border bg-card">
                  {activeJobs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No active tasks</p>
                      <p className="text-xs mt-1">Tasks in progress will appear here</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="divide-y divide-border">
                        {activeJobs.map((job) => (
                          <motion.div
                            key={job.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                            onClick={() => setLocation(`/ecommerce-agent/Catsy-Metadata?job=${job.id}`)}
                            data-testid={`notification-job-${job.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium truncate">{job.fileName}</p>
                                  {getStatusBadge(job.status, job.progressPercent)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(job.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground mt-1" />
                            </div>
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
                          </motion.div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Learning List</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Tasks this agent is learning to perform.
                  </p>
                  <div className="space-y-2">
                    {learningWishlist.map((item) => (
                      <div 
                        key={item.id} 
                        className="p-3 border border-border/50 bg-secondary/10"
                      >
                        <h4 className="font-medium text-sm">{item.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
        <ChatWidget agentName="ecommerce" agentTitle="Emma" />
      </div>
    </Layout>
  );
}
