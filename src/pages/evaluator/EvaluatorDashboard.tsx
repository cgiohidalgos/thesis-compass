import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { mockTheses } from "@/lib/mock-data";

export default function EvaluatorDashboard() {
  return (
    <AppLayout role="evaluator">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Tesis Asignadas
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Trabajos pendientes de evaluación académica.
        </p>

        <div className="space-y-4">
          {mockTheses.slice(0, 2).map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo="/evaluator/rubric"
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
