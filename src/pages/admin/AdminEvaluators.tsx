import AppLayout from "@/components/layout/AppLayout";
import { User, Mail, BookOpen } from "lucide-react";

const evaluators = [
  { id: "1", name: "Dr. Carlos Pérez", email: "cperez@univ.edu", specialty: "Redes y Seguridad", theses: 3 },
  { id: "2", name: "Dra. Ana Rodríguez", email: "arodriguez@univ.edu", specialty: "Machine Learning", theses: 2 },
  { id: "3", name: "Dr. Roberto Sánchez", email: "rsanchez@univ.edu", specialty: "Sistemas de Información", theses: 4 },
  { id: "4", name: "Dra. Patricia Méndez", email: "pmendez@univ.edu", specialty: "IA en Salud", theses: 1 },
];

export default function AdminEvaluators() {
  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Evaluadores
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Profesores registrados como evaluadores de tesis.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evaluators.map((ev) => (
            <div
              key={ev.id}
              className="bg-card rounded-lg border shadow-card p-5 hover:shadow-elevated transition-shadow"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-foreground text-sm">
                    {ev.name}
                  </h4>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {ev.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {ev.specialty}
                </span>
                <span className="status-badge bg-secondary text-secondary-foreground">
                  {ev.theses} tesis
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
