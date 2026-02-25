import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { mockTheses } from "@/lib/mock-data";

export default function StudentDashboard() {
  const thesis = mockTheses[0];

  return (
    <AppLayout role="student">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Mi Tesis
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Consulta el estado y seguimiento de tu trabajo de grado.
        </p>

        <ThesisCard thesis={thesis} linkTo="/student/timeline" />

        {/* Quick info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {[
            { label: "Estado", value: "Aprobada" },
            { label: "Evaluadores", value: "2" },
            { label: "Enviada", value: thesis.submittedAt },
            { label: "Eventos", value: `${thesis.timeline.filter(e => e.completed).length}/${thesis.timeline.length}` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-lg border shadow-card p-4 text-center"
            >
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <p className="font-heading font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
