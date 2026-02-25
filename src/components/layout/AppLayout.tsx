import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  GraduationCap,
  LayoutDashboard,
  FileText,
  Users,
  ClipboardCheck,
  Menu,
  X,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  role: "student" | "evaluator" | "admin";
}

const navItems = {
  student: [
    { label: "Mi Tesis", href: "/student", icon: FileText },
    { label: "Seguimiento", href: "/student/timeline", icon: BookOpen },
  ],
  evaluator: [
    { label: "Tesis Asignadas", href: "/evaluator", icon: FileText },
    { label: "Evaluar", href: "/evaluator/rubric", icon: ClipboardCheck },
  ],
  admin: [
    { label: "Panel", href: "/admin", icon: LayoutDashboard },
    { label: "Tesis", href: "/admin/theses", icon: FileText },
    { label: "Evaluadores", href: "/admin/evaluators", icon: Users },
  ],
};

const roleLabels = {
  student: "Estudiante",
  evaluator: "Evaluador",
  admin: "Administrador",
};

export default function AppLayout({ children, role }: AppLayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const items = navItems[role];

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 gradient-hero flex flex-col transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-primary-foreground">
              EvalTesis
            </h1>
            <p className="text-xs text-sidebar-foreground/70">
              {roleLabels[role]}
            </p>
          </div>
          <button
            className="ml-auto lg:hidden text-sidebar-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <Link
            to="/"
            className="text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            ← Cambiar rol
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center gap-4">
          <button
            className="lg:hidden text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
