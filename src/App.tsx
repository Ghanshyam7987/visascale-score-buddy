import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Calculator from "./pages/Calculator";
import SalarySlip from "./pages/SalarySlip";
import Profile from "./pages/Profile";
import Itineraries from "./pages/Itineraries";
import Events from "./pages/Events";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import CoverLetter from "./pages/CoverLetter";
import Noc from "./pages/Noc";
import VisaNews from "./pages/VisaNews";
import PassportExtractor from "./pages/PassportExtractor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/salary-slip" element={<SalarySlip />} />
            <Route path="/cover-letter" element={<CoverLetter />} />
            <Route path="/noc" element={<Noc />} />
            <Route path="/itineraries" element={<Itineraries />} />
            <Route path="/events" element={<Events />} />
            <Route path="/visa-news" element={<VisaNews />} />
            <Route path="/passport-extractor" element={<PassportExtractor />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
