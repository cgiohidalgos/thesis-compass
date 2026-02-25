import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { mockTheses } from "@/lib/mock-data";
import { FileText, Users, CheckCircle2, Clock } from "lucide-react";

const stats = [
  { label: "Total Tesis", value: "12", icon: FileText, color: "text-info" },
  { label: "En Evaluación", value: "5", icon: Clock, color: "text-warning" },
  { label: "Aprobadas", value: "4", icon: CheckCircle2, color: "text-success" },
  { label: "Evaluadores", value: "8", icon: Users, color: "text-accent" },
];

export default function AdminDashboard() {
  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Panel de Administración
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Gestión integral del proceso de evaluación de tesis.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-lg border shadow-card p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Theses */}
        <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
          Tesis Recientes
        </h3>
        <div className="space-y-4">
          {mockTheses.map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo="/admin/theses"
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
