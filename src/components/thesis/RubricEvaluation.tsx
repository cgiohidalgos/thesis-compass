import { useState } from "react";
import { cn } from "@/lib/utils";
import { defaultRubric, type RubricSection, type EvaluatorConcept } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export default function RubricEvaluation() {
  const [sections, setSections] = useState<RubricSection[]>(
    defaultRubric.map((s) => ({
      ...s,
      criteria: s.criteria.map((c) => ({ ...c, score: undefined, observations: "" })),
    }))
  );
  const [concept, setConcept] = useState<EvaluatorConcept | null>(null);
  const [generalObs, setGeneralObs] = useState("");

  const updateScore = (sectionId: string, criterionId: string, score: number) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              criteria: s.criteria.map((c) =>
                c.id === criterionId ? { ...c, score } : c
              ),
            }
          : s
      )
    );
  };

  const getSectionScore = (section: RubricSection) => {
    const scored = section.criteria.filter((c) => c.score !== undefined);
    if (scored.length === 0) return null;
    const avg =
      scored.reduce((sum, c) => sum + (c.score || 0), 0) /
      scored.length;
    return avg;
  };

  const getFinalScore = () => {
    let total = 0;
    let totalWeight = 0;
    for (const section of sections) {
      const avg = getSectionScore(section);
      if (avg !== null) {
        total += avg * (section.weight / 100);
        totalWeight += section.weight;
      }
    }
    return totalWeight > 0 ? (total / (totalWeight / 100)) : null;
  };

  const finalScore = getFinalScore();

  const conceptOptions: { value: EvaluatorConcept; label: string; icon: typeof CheckCircle2; color: string }[] = [
    { value: "accepted", label: "Aceptado para Sustentación", icon: CheckCircle2, color: "bg-success text-success-foreground" },
    { value: "minor_changes", label: "Cambios Menores", icon: AlertTriangle, color: "bg-warning text-warning-foreground" },
    { value: "major_changes", label: "Cambios Mayores", icon: XCircle, color: "bg-destructive text-destructive-foreground" },
  ];

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionAvg = getSectionScore(section);
        return (
          <div key={section.id} className="bg-card rounded-lg border shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-secondary/50 flex items-center justify-between">
              <div>
                <h3 className="font-heading font-semibold text-foreground">
                  {section.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ponderación: {section.weight}%
                </p>
              </div>
              {sectionAvg !== null && (
                <div className="text-right">
                  <span className="text-2xl font-heading font-bold text-accent">
                    {sectionAvg.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">/5.0</span>
                </div>
              )}
            </div>
            <div className="divide-y divide-border">
              {section.criteria.map((criterion) => (
                <div key={criterion.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-foreground">
                      {criterion.name}
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          onClick={() => updateScore(section.id, criterion.id, score)}
                          className={cn(
                            "w-9 h-9 rounded-md text-sm font-semibold transition-all",
                            criterion.score === score
                              ? "bg-accent text-accent-foreground shadow-md scale-110"
                              : "bg-secondary text-secondary-foreground hover:bg-accent/20"
                          )}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Final Score */}
      <div className="bg-card rounded-lg border shadow-elevated p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading text-lg font-bold text-foreground">
            Nota Final Ponderada
          </h3>
          {finalScore !== null ? (
            <div className="text-right">
              <span className="text-4xl font-heading font-bold text-accent">
                {finalScore.toFixed(2)}
              </span>
              <span className="text-lg text-muted-foreground">/5.0</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Sin calificar</span>
          )}
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {sections.map((section) => {
            const avg = getSectionScore(section);
            return (
              <div
                key={section.id}
                className="bg-secondary/50 rounded-md p-3 text-center"
              >
                <p className="text-xs text-muted-foreground mb-1 truncate">
                  {section.name}
                </p>
                <p className="font-heading font-bold text-foreground">
                  {avg !== null ? `${avg.toFixed(1)}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">× {section.weight}%</p>
              </div>
            );
          })}
        </div>

        {/* Concept */}
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground mb-3 block">
            Concepto del Evaluador
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {conceptOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setConcept(opt.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium",
                  concept === opt.value
                    ? `${opt.color} border-transparent shadow-md`
                    : "bg-card border-border text-foreground hover:border-accent/30"
                )}
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* General observations */}
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Observaciones Generales
          </label>
          <Textarea
            value={generalObs}
            onChange={(e) => setGeneralObs(e.target.value)}
            placeholder="Escriba sus observaciones sobre el trabajo evaluado..."
            className="min-h-[100px]"
          />
        </div>

        <Button
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          disabled={!concept || finalScore === null}
        >
          Enviar Evaluación
        </Button>
      </div>
    </div>
  );
}
