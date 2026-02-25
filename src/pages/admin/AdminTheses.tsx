import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import StatusBadge from "@/components/thesis/StatusBadge";
import { mockTheses } from "@/lib/mock-data";

export default function AdminTheses() {
  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Gestión de Tesis
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Todas las tesis registradas en el sistema.
        </p>

        <div className="space-y-4">
          {mockTheses.map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo={`/admin/theses`}
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
