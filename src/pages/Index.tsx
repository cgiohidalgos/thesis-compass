import { Link } from "react-router-dom";
import { GraduationCap, BookOpen, ClipboardCheck, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const roles = [
  {
    key: "student",
    label: "Estudiante",
    description: "Envía tu tesis, consulta el seguimiento y revisa observaciones de evaluadores.",
    icon: BookOpen,
    href: "/student",
    accent: "group-hover:bg-info/10 group-hover:text-info",
  },
  {
    key: "evaluator",
    label: "Evaluador",
    description: "Evalúa documentos de tesis con rúbrica ponderada y emite conceptos académicos.",
    icon: ClipboardCheck,
    href: "/evaluator",
    accent: "group-hover:bg-accent/10 group-hover:text-accent-foreground",
  },
  {
    key: "admin",
    label: "Administrador",
    description: "Gestiona el proceso completo: validación, asignación y seguimiento institucional.",
    icon: Shield,
    href: "/admin",
    accent: "group-hover:bg-success/10 group-hover:text-success",
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="gradient-hero py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-accent mb-6">
            <GraduationCap className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-primary-foreground mb-4 tracking-tight">
            EvalTesis
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Plataforma integral para la gestión, evaluación y trazabilidad del proceso de tesis universitarias.
          </p>
        </div>
      </div>

      {/* Role Selection */}
      <div className="flex-1 flex items-start justify-center px-6 -mt-8">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-4">
          {roles.map((role, i) => (
            <Link
              key={role.key}
              to={role.href}
              className={cn(
                "group bg-card rounded-xl border shadow-card hover:shadow-elevated transition-all duration-300 p-6 animate-fade-in",
              )}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 transition-colors",
                  role.accent
                )}
              >
                <role.icon className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                {role.label}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {role.description}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-muted-foreground">
        EvalTesis © 2025 — Sistema de Evaluación de Tesis Universitarias
      </footer>
    </div>
  );
}
