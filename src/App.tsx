import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentTimeline from "./pages/student/StudentTimeline";
import EvaluatorDashboard from "./pages/evaluator/EvaluatorDashboard";
import EvaluatorRubric from "./pages/evaluator/EvaluatorRubric";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTheses from "./pages/admin/AdminTheses";
import AdminEvaluators from "./pages/admin/AdminEvaluators";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/timeline" element={<StudentTimeline />} />
          <Route path="/evaluator" element={<EvaluatorDashboard />} />
          <Route path="/evaluator/rubric" element={<EvaluatorRubric />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/theses" element={<AdminTheses />} />
          <Route path="/admin/evaluators" element={<AdminEvaluators />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
