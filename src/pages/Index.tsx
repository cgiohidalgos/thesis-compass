import { Link } from "react-router-dom";
import { GraduationCap, BookOpen, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/utils";

const loginOptions = [
  {
    key: "student",
    label: "Estudiante",
    description: "Ingresa con tu código estudiantil para enviar y dar seguimiento a tu tesis.",
    icon: BookOpen,
    href: "/login/student",
    accent: "group-hover:bg-info/10 group-hover:text-info",
  },
  {
    key: "staff",
    label: "Evaluador / Administrador",
    description: "Accede con tu correo institucional para evaluar tesis o gestionar el sistema.",
    icon: Shield,
    href: "/login/staff",
    accent: "group-hover:bg-accent/10 group-hover:text-accent-foreground",
  },
];

export default function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<{ id: string; name: string; reception_start?: string; reception_end?: string }[]>([]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const isOpen = (p: { reception_start?: string; reception_end?: string }) => {
    const now = Date.now();
    if (p.reception_start && now < Date.parse(p.reception_start)) return false;
    if (p.reception_end && now > Date.parse(p.reception_end)) return false;
    return true;
  };

  useEffect(() => {
    if (!loading && user && role) {
      if (role === "student") navigate("/student");
      else if (role === "evaluator") navigate("/evaluator");
      else if (role === "admin") navigate("/admin");
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${getApiBase()}/programs`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (resp.ok) {
          setPrograms(await resp.json());
        }
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="gradient-hero py-10 md:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-accent mb-6">
            <GraduationCap className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-primary-foreground mb-4 tracking-tight">
            SisTesis
          </h1>
          <p className="text-lg text-primary-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Sistema integrado de Tesis de la Facultad de Ingeniería - USB Cali
          </p>
        </div>
      </div>

      {/* Reception Calendar */}
      <div className="flex-1 px-4 sm:px-6 -mt-10 sm:-mt-12">
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-card border rounded-xl shadow-card p-6">
            <h2 className="font-heading text-xl font-bold mb-2">Calendario de recepción de tesis</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Estas fechas indican los periodos en los cuales los estudiantes pueden registrar tesis por programa.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {programs.map((p) => (
                <div key={p.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.reception_start)} → {formatDate(p.reception_end)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-1 rounded-full",
                        isOpen(p)
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      )}
                    >
                      {isOpen(p) ? "Abierto" : "Cerrado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Login Options */}
      <div className="flex-1 flex items-start justify-center px-4 sm:px-6 -mt-6 sm:-mt-8">
        <div className="max-w-3xl w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          {loginOptions.map((opt, i) => (
            <Link
              key={opt.key}
              to={opt.href}
              className={cn(
                "group bg-card rounded-xl border shadow-card hover:shadow-elevated transition-all duration-300 p-4 sm:p-6 animate-fade-in",
              )}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-4 transition-colors",
                  opt.accent
                )}
              >
                <opt.icon className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                {opt.label}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {opt.description}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        SisTesis © 2025 — Sistema integrado de Tesis de la Facultad de Ingeniería - USB Cali
      </footer>
    </div>
  );
}
