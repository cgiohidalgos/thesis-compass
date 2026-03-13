import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  LayoutDashboard,
  FileText,
  Users,
  Menu,
  X,
  BookOpen,
  LogOut,
  Settings,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface AppLayoutProps {
  children: ReactNode;
  // superadmin uses admin navigation plus extra links
  role: "student" | "evaluator" | "admin" | "superadmin";
}

const navItems = {
  student: [
    { label: "Mi Tesis", href: "/student", icon: FileText },
    { label: "Seguimiento", href: "/student/timeline", icon: BookOpen },
  ],
  evaluator: [
    { label: "Tesis Asignadas", href: "/evaluator", icon: FileText },
    // (el enlace Evaluar redirige al dashboard, así que no necesita entrada separada)
  ],
  admin: [
    { label: "Panel", href: "/admin", icon: LayoutDashboard },
    { label: "Tesis", href: "/admin/theses", icon: FileText },
    { label: "Evaluadores", href: "/admin/evaluators", icon: Users },
    { label: "Programas", href: "/admin/programs", icon: BookOpen },
    { label: "Rúbricas", href: "/admin/rubrics", icon: BookOpen },
    { label: "Elementos de Revisión", href: "/admin/review-items", icon: BookOpen },
    { label: "Pesos de Evaluación", href: "/admin/weights", icon: BookOpen },
  ],
};

const roleLabels = {
  student: "Estudiante",
  evaluator: "Evaluador",
  admin: "Administrador",
  superadmin: "Superadministrador",
};

export default function AppLayout({ children, role }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isSuper } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // treat superadmin the same as admin for menu items
  const effectiveRole = role === 'superadmin' ? 'admin' : role;
  let items = navItems[effectiveRole as keyof typeof navItems];
  // hide programas section unless user is superadmin
  if (effectiveRole === 'admin' && !isSuper) {
    items = items.filter(i => i.href !== '/admin/programs');
  }
  // add users and smtp-config options for superadmin (review-items and weights are already in base admin menu)
  if (effectiveRole === 'admin') {
    items = [
      ...items,
      { label: 'Notificaciones', href: '/admin/notifications', icon: Bell },
    ];
  }
  if (isSuper && effectiveRole === 'admin') {
    items = [
      ...items,
      { label: 'Usuarios', href: '/admin/users', icon: Users },
      { label: 'Configuración SMTP', href: '/admin/smtp-config', icon: Settings },
    ];
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-dvh flex">
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
          "fixed lg:sticky top-0 left-0 z-50 h-dvh w-64 gradient-hero flex flex-col transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-primary-foreground">
              SisTesis
            </h1>
            <p className="text-xs text-sidebar-foreground/70">
              {roleLabels[role]}
              {isSuper && <span className="ml-1 text-yellow-400 font-bold text-xs">(superadmin)</span>}
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

        <div className="p-4 border-t border-sidebar-border space-y-2">
          {profile && (
            <p className="text-xs text-sidebar-foreground/70 truncate mb-2">
              {profile.full_name}
            </p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-dvh">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-4">
          <button
            className="lg:hidden text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
