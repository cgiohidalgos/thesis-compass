import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentTimeline from "./pages/student/StudentTimeline";
import RegisterThesis from "./pages/student/RegisterThesis";
import EvaluatorDashboard from "./pages/evaluator/EvaluatorDashboard";
import EvaluatorRubric from "./pages/evaluator/EvaluatorRubric";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTheses from "./pages/admin/AdminTheses";
import AdminThesisDetail from "./pages/admin/AdminThesisDetail";
import AdminEvaluators from "./pages/admin/AdminEvaluators";
import AdminEvaluations from "./pages/admin/AdminEvaluations";
import AdminPrograms from "./pages/admin/AdminPrograms";
import AdminRubrics from "./pages/admin/AdminRubrics";
import AdminReviewItems from "./pages/admin/AdminReviewItems";
import AdminWeights from "./pages/admin/AdminWeights";
import AdminUsers from "./pages/admin/AdminUsers";
import SuperReviewItems from "./pages/admin/SuperReviewItems";
import SuperWeights from "./pages/admin/SuperWeights";
import StudentRegister from "./pages/auth/StudentRegister";
import StudentLogin from "./pages/auth/StudentLogin";
import StaffLogin from "./pages/auth/StaffLogin";
import SignWithToken from "./pages/SignWithToken";
import SignMeritoriaWithToken from "./pages/SignMeritoriaWithToken";
import SignSuccess from "./pages/SignSuccess";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/register/student" element={<StudentRegister />} />
            <Route path="/login/student" element={<StudentLogin />} />
            <Route path="/login/staff" element={<StaffLogin />} />
            <Route path="/sign/token/:token" element={<SignWithToken />} />
            <Route path="/sign/meritoria/token/:token" element={<SignMeritoriaWithToken />} />
            <Route path="/sign-success" element={<SignSuccess />} />
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/timeline" element={<StudentTimeline />} />
            <Route path="/student/register-thesis" element={<RegisterThesis />} />
            <Route path="/evaluator" element={<EvaluatorDashboard />} />
            {/* redirect bare rubric path back to dashboard */}
            <Route path="/evaluator/rubric" element={<EvaluatorDashboard />} />
            <Route path="/evaluator/rubric/:id" element={<EvaluatorRubric />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/theses" element={<AdminTheses />} />
            <Route path="/admin/theses/:id" element={<AdminThesisDetail />} />
            <Route path="/admin/evaluators" element={<AdminEvaluators />} />
            <Route path="/admin/evaluations" element={<AdminEvaluations />} />
            <Route path="/admin/programs" element={<AdminPrograms />} />
            <Route path="/admin/rubrics" element={<AdminRubrics />} />
            <Route path="/admin/review-items" element={<AdminReviewItems />} />
            <Route path="/admin/weights" element={<AdminWeights />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
