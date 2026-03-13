import { useState } from "react";
import { getApiBase } from "@/lib/utils";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export default function StaffLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Ingrese su correo y contraseña");
      return;
    }

    setLoading(true);
    try {
      const url = `${getApiBase()}/auth/login`;
      console.log('StaffLogin: POST', url);
      // simple timeout helper
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const { user, token } = await resp.json();
      const rolesUrl = `${getApiBase()}/user_roles?user_id=${encodeURIComponent(user.id)}`;
      console.log('StaffLogin: GET', rolesUrl);
      const rolesResp = await fetch(rolesUrl, { signal: controller.signal });
      const roles = await rolesResp.json();
      const userRole = roles?.[0];
      if (token) localStorage.setItem('token', token);
      if (userRole === "admin" || userRole === "superadmin") {
        navigate("/admin");
      } else if (userRole === "evaluator") {
        navigate("/evaluator");
      } else {
        navigate("/");
      }
      toast.success("Bienvenido(a)");
      // reload app so AuthProvider picks up the new roles on the target page
      window.location.reload();
    } catch (error: any) {
      console.error('login error', error);
      if (error.name === 'AbortError') {
        toast.error('La petición tomó demasiado tiempo, revisa la conexión o el servidor');
      } else {
        toast.error("Correo o contraseña incorrectos");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-hero mb-4">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Acceso Institucional
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evaluadores y Administradores
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-card border rounded-xl shadow-card p-4 sm:p-6 space-y-4">
          <div>
            <Label htmlFor="email">Correo Institucional</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@universidad.edu"
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
