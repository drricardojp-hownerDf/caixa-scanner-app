import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/dashboard";
import PropertyDetail from "@/pages/property-detail";
import SyncPage from "@/pages/sync";
import ComparePage from "@/pages/compare";
import ShortcutGuidePage from "@/pages/shortcut-guide";
import NotFound from "@/pages/not-found";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

function AppContent() {
  return (
    <Router hook={useHashLocation}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/property/:id" component={PropertyDetail} />
              <Route path="/sync" component={SyncPage} />
              <Route path="/compare" component={ComparePage} />
              <Route path="/shortcut" component={ShortcutGuidePage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </SidebarProvider>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
