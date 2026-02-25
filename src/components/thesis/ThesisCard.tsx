import { Link } from "react-router-dom";
import { FileText, Users, Calendar } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Thesis } from "@/lib/mock-data";

interface ThesisCardProps {
  thesis: Thesis;
  linkTo: string;
}

export default function ThesisCard({ thesis, linkTo }: ThesisCardProps) {
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
          <StatusBadge status={thesis.status} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {thesis.students.map((s) => s.name.split(" ").slice(0, 2).join(" ")).join(", ")}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {thesis.submittedAt}
          </span>
          {thesis.evaluators.length > 0 && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {thesis.evaluators.length} evaluador(es)
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
