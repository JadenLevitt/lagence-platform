import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AdminDashboard from "@/pages/admin-dashboard";
import AgentDashboard from "@/pages/results";
import TaskPage from "@/pages/home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AdminDashboard} />
      <Route path="/ecommerce-agent" component={AgentDashboard} />
      <Route path="/ecommerce-agent/Catsy-Metadata" component={TaskPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SonnerToaster position="bottom-right" />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
