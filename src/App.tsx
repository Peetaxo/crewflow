import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "./app/providers/AuthProvider";
import ForgotPasswordView from './features/onboarding/ForgotPasswordView';
import ResetPasswordView from './features/onboarding/ResetPasswordView';
import PasswordRecoveryLinks from './features/onboarding/PasswordRecoveryLinks';
import OnboardingLinkGate from './features/onboarding/OnboardingLinkGate';
import { isPasswordRecoveryEnabled } from './features/onboarding/services/password-recovery.service';
import ActivationView from "./features/onboarding/ActivationView";
import NativeActivationLinks from "./features/onboarding/NativeActivationLinks";
import { isOnboardingEnabled } from "./features/onboarding/services/activation.service";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <NativeActivationLinks gateChildren={false}>
        <PasswordRecoveryLinks gateChildren={false}>
          <OnboardingLinkGate>
            <Routes>
              <Route path="/forgot-password" element={<ForgotPasswordView />} />
              <Route path="/reset-password" element={isPasswordRecoveryEnabled() ? <AuthProvider><ResetPasswordView /></AuthProvider> : <ResetPasswordView />} />
              <Route path="/activate" element={isOnboardingEnabled() ? <AuthProvider><ActivationView /></AuthProvider> : <ActivationView />} />
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Index />} />
              <Route path="/app" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OnboardingLinkGate>
        </PasswordRecoveryLinks>
      </NativeActivationLinks>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
