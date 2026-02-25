import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { mockTheses } from "@/lib/mock-data";

export default function StudentTimeline() {
  const thesis = mockTheses[0];

  return (
    <AppLayout role="student">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-heading text-2xl font-bold text-foreground">
              Seguimiento de mi Tesis
            </h2>
            <StatusBadge status={thesis.status} />
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {thesis.title}
          </p>
        </div>

        <ThesisTimeline events={thesis.timeline} />
      </div>
    </AppLayout>
  );
}
