import { Check, Clock, Circle, FileText, User, Shield, Download, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/mock-data";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

interface ThesisTimelineProps {
  events: TimelineEvent[];
  evaluatorFiles?: { name: string; url: string }[];
  evaluatorRecommendations?: string;
  isBlindReview?: boolean;
  /** si el componente se muestra en vista de administrador */
  isAdmin?: boolean;
}

const actorIcons = {
  admin: Shield,
  evaluator: User,
  system: FileText,
};

export default function ThesisTimeline({ events, evaluatorFiles, evaluatorRecommendations, isBlindReview, isAdmin }: ThesisTimelineProps) {
  return (
    <div className="relative">
      {events.map((event, index) => {
        const ActorIcon = actorIcons[event.actorRole];
        const isConceptIssued = event.status === "concept_issued";
        const showEvaluatorFeedback = (isConceptIssued || event.status === 'evaluation_submitted' || event.status === 'evaluator_thanks') && event.completed;
        const showRevisionFeedback = event.status === 'revision_submitted' && event.completed;

        return (
          <div
            key={event.id}
            className={cn("relative pl-10 pb-8 last:pb-0", "animate-fade-in")}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {/* Vertical line */}
            {index < events.length - 1 && (
              <div
                className={cn(
                  "absolute left-[15px] top-8 bottom-0 w-0.5",
                  event.completed ? "bg-success" : "bg-border"
                )}
              />
            )}

            {/* Dot */}
            <div
              className={cn(
                "absolute left-1.5 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2",
                event.completed
                  ? "bg-success border-success text-success-foreground"
                  : event.active
                  ? "bg-accent border-accent text-accent-foreground animate-pulse-glow"
                  : "bg-muted border-border text-muted-foreground"
              )}
            >
              {event.completed ? (
                <Check className="w-3 h-3" />
              ) : event.active ? (
                <Clock className="w-3 h-3" />
              ) : (
                <Circle className="w-2 h-2" />
              )}
            </div>

            {/* Content card */}
            <div
              className={cn(
                "rounded-lg border p-4 transition-all",
                event.active
                  ? "bg-card shadow-elevated border-accent/30"
                  : event.completed
                  ? "bg-card shadow-card border-border"
                  : "bg-muted/50 border-border/50"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4
                  className={cn(
                    "font-heading font-semibold text-sm",
                    event.active ? "text-accent-foreground" : event.completed ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span className="whitespace-pre-wrap">{event.label}</span>
                </h4>
                {event.date && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.date).toLocaleString()}
                  </span>
                )}
              </div>

              {event.actor && !isBlindReview && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <ActorIcon className="w-3 h-3" />
                  <span>{event.actor}</span>
                </div>
              )}

              {event.actor && isBlindReview && event.actorRole === "evaluator" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <User className="w-3 h-3" />
                  <span>Evaluador (Par ciego)</span>
                </div>
              )}

              {event.status === 'defense_scheduled' ? (
                <div className="mt-2 p-3 bg-info/10 rounded">
                  {event.defense_date && (
                    <p className="text-sm">
                      <strong>Fecha y hora:</strong>{' '}
                      <span className="font-medium">{new Date(event.defense_date).toLocaleString()}</span>
                    </p>
                  )}
                  {event.defense_location && (
                    <p className="text-sm">
                      <strong>Lugar:</strong>{' '}
                      <span className="font-medium">{event.defense_location}</span>
                    </p>
                  )}
                  {event.defense_info && (
                    <p className="text-sm">
                      <strong>Info adicional:</strong>{' '}
                      <span className="font-medium">{event.defense_info}</span>
                    </p>
                  )}
                </div>
              ) : event.observations && (
                <p className="text-sm text-muted-foreground leading-relaxed">{event.observations}</p>
              )}

              {/* Show evaluator recommendations and files */}
              {showEvaluatorFeedback && (
                <div className="mt-3 space-y-3">
                  {(event.evaluatorRecommendations || evaluatorRecommendations) && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1.5">
                        <MessageSquare className="w-3 h-3" />
                        Recomendaciones del Evaluador
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {event.evaluatorRecommendations || evaluatorRecommendations}
                      </p>
                    </div>
                  )}
                  {(event.evaluatorFiles?.length > 0 || (evaluatorFiles && evaluatorFiles.length > 0)) && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <p className="text-xs font-medium text-foreground mb-2">Archivos del Evaluador</p>
                      <div className="space-y-1.5">
                        {(event.evaluatorFiles || evaluatorFiles || []).map((file, i) => (
                          <a
                            key={i}
                            href={`${API_BASE}${file.url.startsWith('/') ? '' : '/'}${file.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-accent hover:underline"
                          >
                            <Download className="w-3 h-3" />
                            {file.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Show student revision comments/files */}
              {showRevisionFeedback && (
                <div className="mt-3 space-y-3">
              {event.observations && (
                <div className="bg-secondary/50 rounded-md p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1.5">
                    <MessageSquare className="w-3 h-3" />
                    Comentarios del Estudiante
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {event.observations}
                  </p>
                </div>
              )}
                  {event.revisionFiles && event.revisionFiles.length > 0 && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <p className="text-xs font-medium text-foreground mb-2">Archivos de la revisión</p>
                      <div className="space-y-1.5">
                        {event.revisionFiles.map((file, i) => (
                          <a
                            key={i}
                            href={`${API_BASE}${file.url.startsWith('/') ? '' : '/'}${file.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-accent hover:underline"
                          >
                            <Download className="w-3 h-3" />
                            {file.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {event.attachments && event.attachments.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {event.attachments.map((file, i) => (
                    <span key={i} className="status-badge bg-secondary text-secondary-foreground">
                      <FileText className="w-3 h-3" />
                      {file}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* thank you message at completion */}
      {events.length > 0 && events[events.length - 1].status === 'evaluator_thanks' && (
        <div className="relative pl-10 pb-8 last:pb-0 animate-fade-in" style={{ animationDelay: `${events.length * 80}ms` }}>
          <div className="rounded-lg border p-4 bg-secondary/10">
            <p className="text-sm font-medium text-foreground">
              {isAdmin
                ? 'Recuerda a los evaluadores que actualicen su CVLAC tras finalizar sus evaluaciones.'
                : '¡Gracias por completar la evaluación! No olvides subir este trabajo a tu CVLAC.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
