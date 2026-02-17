import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { AuthProvider } from "@/hooks/use-auth";
import { NotificationProvider } from "@/hooks/use-notifications";
import { ProtectedRoute } from "@/lib/protected-route";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

// Lazy load page components
const LandingPage = lazy(() => import("@/pages/landing-page"));
const EscortProfile = lazy(() => import("@/pages/escort-profile"));
const ClientDashboard = lazy(() => import("@/pages/client-dashboard"));
const ClientSettings = lazy(() => import("@/pages/client-settings"));
const EscortDashboard = lazy(() => import("@/pages/escort-dashboard"));
const Checkout = lazy(() => import("@/pages/checkout"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const Login = lazy(() => import("@/pages/auth/login"));
const Signup = lazy(() => import("@/pages/auth/signup"));
const PasswordReset = lazy(() => import("@/pages/auth/password-reset"));
const ResetPassword = lazy(() => import("@/pages/auth/reset-password"));
const Messages = lazy(() => import("@/pages/messages"));
const PartnerSettings = lazy(() => import("@/pages/partner-settings"));
const NotificationCenter = lazy(() => import("@/pages/notification-center"));
const SosView = lazy(() => import("@/pages/sos-view"));
const NotFound = lazy(() => import("@/pages/not-found"));

function ScrollToTop() {
  const [location] = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/auth/login" />;
  if (user.role === "ESCORT") return <Redirect to="/escort-dashboard" />;
  if (user.role === "ADMIN") return <Redirect to="/admin" />;
  return <Redirect to="/client-dashboard" />;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <Spinner className="size-8 text-primary" />
          </div>
        }
      >
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/auth/login" component={Login} />
          <Route path="/auth/signup" component={Signup} />
          <Route path="/auth/forgot-password" component={PasswordReset} />
          <Route path="/auth/reset-password" component={ResetPassword} />
          <Route path="/profile/:id" component={EscortProfile} />
          <ProtectedRoute path="/profile" component={ClientSettings} />
          <ProtectedRoute path="/checkout" component={Checkout} />
          <ProtectedRoute path="/dashboard" component={DashboardRedirect} />
          <ProtectedRoute path="/client-dashboard" component={ClientDashboard} />
          <ProtectedRoute path="/messages/:userId?" component={Messages} />
          <ProtectedRoute path="/escort-dashboard" component={EscortDashboard} />
          <ProtectedRoute path="/partner-settings" component={PartnerSettings} />
          <ProtectedRoute path="/notifications" component={NotificationCenter} />
          <ProtectedRoute path="/admin" component={AdminDashboard} />
          <Route path="/sos/:alertId" component={SosView} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          <TooltipProvider>
            <Toaster />
            <PWAInstallPrompt />
            <Router />
          </TooltipProvider>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
