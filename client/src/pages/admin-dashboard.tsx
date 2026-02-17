import { useLocation } from "wouter";
import { motion } from "framer-motion";
import Layout from "@/components/layout";
import { 
  ArrowRight, 
  ShoppingBag, 
  Package, 
  Scissors, 
  Factory, 
  Megaphone, 
  Wallet, 
  Truck, 
  Heart, 
  Headphones,
  LucideIcon
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
  href: string | null;
  active: boolean;
}

const agents: Agent[] = [
  {
    id: "ecommerce",
    name: "E-commerce",
    role: "Digital Merchandising & Product Data",
    icon: ShoppingBag,
    href: "/ecommerce-agent",
    active: true
  },
  {
    id: "wholesale",
    name: "Wholesale",
    role: "B2B Sales & Distribution",
    icon: Package,
    href: null,
    active: false
  },
  {
    id: "design",
    name: "Design",
    role: "Collection Development & Creative",
    icon: Scissors,
    href: null,
    active: false
  },
  {
    id: "production",
    name: "Production",
    role: "Sourcing & Manufacturing",
    icon: Factory,
    href: null,
    active: false
  },
  {
    id: "marketing",
    name: "Marketing",
    role: "Campaigns & Brand Communications",
    icon: Megaphone,
    href: null,
    active: false
  },
  {
    id: "finance",
    name: "Finance",
    role: "Revenue & Compliance",
    icon: Wallet,
    href: null,
    active: false
  },
  {
    id: "operations",
    name: "Operations",
    role: "Logistics & Facilities",
    icon: Truck,
    href: null,
    active: false
  },
  {
    id: "customer-care",
    name: "Customer Care",
    role: "E-commerce Support",
    icon: Heart,
    href: null,
    active: false
  },
  {
    id: "customer-service",
    name: "Customer Service",
    role: "Wholesale Support",
    icon: Headphones,
    href: null,
    active: false
  }
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="border-b border-border bg-white px-12 py-10">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">L'AGENCE</p>
          <h1 className="font-serif text-4xl">Department Agents</h1>
          <p className="text-muted-foreground text-sm mt-4 max-w-2xl">
            Select an agent to view their capabilities, active tasks, and learning list.
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-12">
            <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-6">Agents</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <motion.div
                  key={agent.id}
                  whileHover={agent.active ? { y: -2 } : {}}
                  className={`
                    p-6 border transition-all
                    ${agent.active 
                      ? "border-border bg-white cursor-pointer hover:border-black/30 hover:shadow-lg" 
                      : "border-border/50 bg-secondary/20 opacity-50 cursor-not-allowed"
                    }
                  `}
                  onClick={() => agent.active && agent.href && setLocation(agent.href)}
                  data-testid={`agent-${agent.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-sm flex items-center justify-center ${agent.active ? "bg-black" : "bg-muted"}`}>
                      <agent.icon className={`w-6 h-6 stroke-[1.5] ${agent.active ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif text-lg">{agent.name}</h3>
                        {agent.active && (
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{agent.role}</p>
                      {!agent.active && (
                        <span className="inline-block mt-2 text-[9px] uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-0.5">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    {agent.active && (
                      <ArrowRight className="w-4 h-4 text-muted-foreground mt-1" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
