import AppLayout from "@/components/layout/AppLayout";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";

export default function EvaluatorRubric() {
  return (
    <AppLayout role="evaluator">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
            Rúbrica de Evaluación
          </h2>
          <p className="text-sm text-muted-foreground">
            Sistema de Detección de Intrusiones Basado en Aprendizaje Profundo para Redes IoT
          </p>
        </div>

        <RubricEvaluation />
      </div>
    </AppLayout>
  );
}
