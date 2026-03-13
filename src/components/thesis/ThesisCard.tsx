import { Link } from "react-router-dom";
import { FileText, Users, Calendar } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Thesis } from "@/lib/mock-data";

interface ThesisCardProps {
  thesis: Thesis;
  linkTo: string;
  evaluated?: boolean;
  evalCompleted?: boolean;
  hasActa?: boolean;
}

export default function ThesisCard({ thesis, linkTo, evaluated, evalCompleted, hasActa }: ThesisCardProps) {
  return (
    <Link
      to={linkTo}
      className="block bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
            {thesis.title}
          </h3>
          <div className="flex items-center gap-2">
            {evalCompleted ? (
              <>
                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">{hasActa ? 'Terminada con Acta' : 'Evaluación terminada'}</span>
              </>
            ) : evaluated ? (
              <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">Evaluado</span>
            ) : null}
            {!evalCompleted && <StatusBadge status={thesis.status} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {thesis.students.map((s) => {
              if (!s.name) return '';
              return s.name.split(" ").slice(0, 2).join(" ");
            }).filter(Boolean).join(", ")}
          </span>
          {thesis.programs && thesis.programs.length > 0 && (
            <span className="flex items-center gap-1.5">
              📚
              {thesis.programs.map((p) => p.name).join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {thesis.created_at
              ? new Date(
                  thesis.created_at > 1e12 ? thesis.created_at : thesis.created_at * 1000
                ).toLocaleDateString('es-CO')
              : thesis.submittedAt}
          </span>
          {thesis.evaluators.length > 0 && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {thesis.evaluators.length} evaluador(es)
            </span>
          )}
          {thesis.evaluators.some(e=>e.due_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {thesis.evaluators
                .map(e => e.due_date)
                .filter(Boolean)
                .map(d => {
                  const ms = d! > 1e12 ? d! : d! * 1000;
                  return new Date(ms).toLocaleDateString('es-CO');
                })
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
