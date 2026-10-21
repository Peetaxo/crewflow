import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "./app/providers/AuthProvider";
import ActivationView from "./features/onboarding/ActivationView";
import NativeActivationLinks from "./features/onboarding/NativeActivationLinks";
import { isOnboardingEnabled } from "./features/onboarding/services/activation.service";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <NativeActivationLinks>
        <Routes>
          <Route path="/activate" element={isOnboardingEnabled() ? <AuthProvider><ActivationView /></AuthProvider> : <ActivationView />} />
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Index />} />
          <Route path="/app" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </NativeActivationLinks>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
