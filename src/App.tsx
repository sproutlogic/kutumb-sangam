import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { TreeProvider } from "@/contexts/TreeContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Index from "@/pages/Index";
import SignIn from "@/pages/SignIn";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import TreePage from "@/pages/TreePage";
import InvitePage from "@/pages/InvitePage";
import VerificationPage from "@/pages/VerificationPage";
import DiscoveryPage from "@/pages/DiscoveryPage";
import MatrimonyPage from "@/pages/MatrimonyPage";
import UpgradePage from "@/pages/UpgradePage";
import SupportPage from "@/pages/SupportPage";
import EnterCode from "@/pages/EnterCode";
import CodeResult from "@/pages/CodeResult";
import NodePage from "@/pages/NodePage";
import PanditKycPage from "@/pages/PanditKycPage";
import PanditDashboard from "@/pages/PanditDashboard";
import ReferralNewTree from "@/pages/ReferralNewTree";
import ReferralPandit from "@/pages/ReferralPandit";
import DeviceReVerifyPage from "@/pages/DeviceReVerifyPage";
import SalesDashboard from "@/pages/SalesDashboard";
import KutumbCalendarPage from "@/pages/KutumbCalendarPage";
import KutumbRadarPage from "@/pages/KutumbRadarPage";
import LegacyBoxPage from "@/pages/LegacyBoxPage";
import TimeBankPage from "@/pages/TimeBankPage";
import TransactionsPage from "@/pages/TransactionsPage";
import KutumbProPage from "@/pages/KutumbProPage";
import OrgSetupWizard from "@/pages/OrgSetupWizard";
import OrgListPage from "@/pages/OrgListPage";
import OrgDashboard from "@/pages/OrgDashboard";
import OrgMembersPage from "@/pages/OrgMembersPage";
import OrgJoinPage from "@/pages/OrgJoinPage";
import ComingSoonPage from "@/pages/ComingSoonPage";
import HaritCirclePage from "@/pages/HaritCirclePage";
import ParyavaranMitraEarnings from "@/pages/ParyavaranMitraEarnings";
import NotFound from "@/pages/NotFound";

// ── Eco-Panchang & Green Legacy ──────────────────────────────────────────────
import EcoPanchangPage from "@/pages/PrakritiCalendarPage";
import EcoSewaPage from "@/pages/EcoSewaPage";
import EcoServicesPage from "@/pages/EcoServicesPage";
import ServiceOrderDetailPage from "@/pages/ServiceOrderDetailPage";
import GreenLegacyPage from "@/pages/GreenLegacyPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import VendorPortalPage from "@/pages/VendorPortalPage";
import ContentQueuePage from "@/pages/ContentQueuePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <TreeProvider>
              <PlanProvider>
                <WorkspaceProvider>
                <TooltipProvider delayDuration={300}>
                  <Toaster />
                  <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<Index />} />
                    <Route path="/signin" element={<SignIn />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/passkey-setup" element={<SignIn />} />
                    <Route path="/code" element={<EnterCode />} />
                    <Route path="/code/:type/:code" element={<CodeResult />} />
                    <Route path="/code/:code" element={<CodeResult />} />

                    {/* Protected — any authenticated user */}
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/tree" element={<ProtectedRoute><TreePage /></ProtectedRoute>} />
                    <Route path="/invite" element={<ProtectedRoute><InvitePage /></ProtectedRoute>} />
                    <Route path="/verification" element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />
                    <Route path="/discovery" element={<ProtectedRoute><DiscoveryPage /></ProtectedRoute>} />
                    <Route path="/matrimony" element={<ProtectedRoute><MatrimonyPage /></ProtectedRoute>} />
                    <Route path="/upgrade" element={<ProtectedRoute><UpgradePage /></ProtectedRoute>} />
                    <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
                    <Route path="/node" element={<ProtectedRoute><NodePage /></ProtectedRoute>} />
                    <Route path="/node/:id" element={<ProtectedRoute><NodePage /></ProtectedRoute>} />
                    <Route path="/referral-new-tree" element={<ProtectedRoute><ReferralNewTree /></ProtectedRoute>} />
                    <Route path="/referral-margdarshak" element={<ProtectedRoute><ReferralPandit /></ProtectedRoute>} />
                    <Route path="/device-reverify" element={<ProtectedRoute><DeviceReVerifyPage /></ProtectedRoute>} />
                    <Route path="/sales" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><KutumbCalendarPage /></ProtectedRoute>} />
                    <Route path="/radar" element={<ProtectedRoute><KutumbRadarPage /></ProtectedRoute>} />
                    <Route path="/legacy-box" element={<ProtectedRoute><LegacyBoxPage /></ProtectedRoute>} />
                    <Route path="/time-bank" element={<ProtectedRoute><TimeBankPage /></ProtectedRoute>} />
                    <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />

                    {/* Kutumb Pro — Community OS */}
                    <Route path="/kutumb-pro" element={<ProtectedRoute><KutumbProPage /></ProtectedRoute>} />
                    <Route path="/org/new" element={<ProtectedRoute><OrgSetupWizard /></ProtectedRoute>} />
                    <Route path="/org/my" element={<ProtectedRoute><OrgListPage /></ProtectedRoute>} />
                    <Route path="/org/join/:code" element={<ProtectedRoute><OrgJoinPage /></ProtectedRoute>} />
                    <Route path="/org/:slug" element={<ProtectedRoute><OrgDashboard /></ProtectedRoute>} />
                    <Route path="/org/:slug/members" element={<ProtectedRoute><OrgMembersPage /></ProtectedRoute>} />

                    {/* Upcoming / Launching Soon */}
                    <Route path="/upcoming/:serviceId" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />

                    {/* Protected — Margdarshak role only */}
                    <Route path="/harit-circle" element={<ProtectedRoute><HaritCirclePage /></ProtectedRoute>} />
                    <Route path="/mitra-earnings" element={<ProtectedRoute><ParyavaranMitraEarnings /></ProtectedRoute>} />
                    <Route path="/margdarshak" element={<ProtectedRoute requiredRole="margdarshak"><PanditDashboard /></ProtectedRoute>} />

                    {/* Margdarshak KYC is public so Margdarshaks can register */}
                    <Route path="/margdarshak-kyc" element={<PanditKycPage />} />

                    {/* ── Eco-Panchang & Prakriti (public, no auth required) ── */}
                    <Route path="/eco-panchang" element={<EcoPanchangPage />} />
                    <Route path="/green-legacy/:vanshaId" element={<GreenLegacyPage />} />
                    <Route path="/leaderboard" element={<LeaderboardPage />} />
                    <Route path="/services" element={<EcoServicesPage />} />

                    {/* ── Eco-Sewa & Service Orders (authenticated) ── */}
                    <Route path="/eco-sewa" element={<ProtectedRoute><EcoSewaPage /></ProtectedRoute>} />
                    <Route path="/services/orders/:orderId" element={<ProtectedRoute><ServiceOrderDetailPage /></ProtectedRoute>} />

                    {/* ── Vendor portal (authenticated vendor) ── */}
                    <Route path="/vendor-portal" element={<ProtectedRoute><VendorPortalPage /></ProtectedRoute>} />

                    {/* ── Admin content queue (admin / superadmin) ── */}
                    <Route path="/admin/content" element={<ProtectedRoute><ContentQueuePage /></ProtectedRoute>} />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </TooltipProvider>
                </WorkspaceProvider>
              </PlanProvider>
            </TreeProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
