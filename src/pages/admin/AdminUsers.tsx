import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface User {
  id: string;
  full_name: string;
  student_code?: string;
  cedula?: string;
  institutional_email?: string;
  roles: string[];
  program_ids?: string[];
}

const API_BASE = getApiBase();

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<{id:string;name:string}[]>([]); // used to display program names for admins
  const [form, setForm] = useState<any>({
    password: "",
    full_name: "",
    student_code: "",
    cedula: "",
    institutional_email: "",
    roles: "student",
    program_ids: [] as string[],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/users`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data);
      } else if (resp.status === 403 || resp.status === 401) {
        // if user isn't superadmin they'll hit this endpoint, redirect
        toast.error("No autorizado para gestionar usuarios");
        navigate("/admin");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (resp.ok) {
        const data = await resp.json();
        setPrograms(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const { isSuper, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // redirect non-superadmins immediately
    if (!authLoading && !isSuper) {
      toast.error("Sólo los superadministradores pueden acceder a esta sección");
      navigate("/admin");
    }
  }, [isSuper, authLoading, navigate]);

  // while we are checking or if unauthorized just don't render anything
  if (!authLoading && !isSuper) {
    return null;
  }

  useEffect(() => {
    fetchUsers();
    fetchPrograms();
  }, []);

  const resetForm = () => {
    setForm({
      password: "",
      full_name: "",
      student_code: "",
      cedula: "",
      institutional_email: "",
      roles: "student",
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        full_name: form.full_name,
        student_code: form.student_code || undefined,
        cedula: form.cedula || undefined,
        institutional_email: form.institutional_email || undefined,
        roles: form.roles ? [form.roles] : [],
      };
      if (form.roles === 'admin') {
        payload.program_ids = form.program_ids || [];
      }
      if (!editingId || form.password) payload.password = form.password;

      let resp;
      if (editingId) {
        resp = await fetch(`${API_BASE}/super/users/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(payload),
        });
      } else {
        payload.password = form.password;
        resp = await fetch(`${API_BASE}/super/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(payload),
        });
      }
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast.error("No autorizado para modificar usuarios");
          navigate("/admin");
          return;
        }
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "Error guardando usuario");
      }
      toast.success(editingId ? "Usuario actualizado" : "Usuario creado");
      resetForm();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (u: User & { program_ids?: string[] }) => {
    setEditingId(u.id);
    setForm({
      password: "",
      full_name: u.full_name,
      student_code: u.student_code || "",
      cedula: u.cedula || "",
      institutional_email: u.institutional_email || "",
      roles: u.roles[0] || "student",
      program_ids: u.program_ids || [],
    });
    toast.success(`Editando ${u.full_name || "usuario"}`);
    const el = document.getElementById("user-form");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este usuario? Esta acción es irreversible.")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast.error("No autorizado para eliminar usuarios");
          navigate("/admin");
          return;
        }
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Error eliminando usuario");
      }
      toast.success("Usuario borrado");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout role="superadmin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-4">Gestión de Usuarios</h2>
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-xl shadow-card p-6 mb-8">
          {!editingId && (
            <div>
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
          )}
          {editingId && (
            <div>
              <Label>Contraseña (dejar en blanco para no cambiar)</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          )}
          <div>
            <Label>Nombre completo</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Código</Label>
            <Input
              value={form.student_code}
              onChange={(e) => setForm({ ...form, student_code: e.target.value })}
            />
          </div>
          <div>
            <Label>Cédula</Label>
            <Input
              value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            />
          </div>
          <div>
            <Label>Correo institucional</Label>
            <Input
              value={form.institutional_email}
              onChange={(e) => setForm({ ...form, institutional_email: e.target.value })}
            />
          </div>
          <div>
            <Label>Rol</Label>
            <select
              className="block w-full rounded border px-2 py-1"
              value={form.roles}
              onChange={(e) => setForm({ ...form, roles: e.target.value, program_ids: [] })}
            >
              <option value="student">Estudiante</option>
              <option value="evaluator">Evaluador</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          {form.roles === 'admin' && (
            <div>
              <Label>Programas asignados</Label>
              <select
                multiple
                className="block w-full rounded border px-2 py-1 h-32"
                value={form.program_ids}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                  setForm({ ...form, program_ids: opts });
                }}
              >
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
          </Button>
          {editingId && (
            <Button variant="ghost" type="button" onClick={resetForm} className="ml-2">
              Cancelar
            </Button>
          )}
        </form>

        <table className="w-full table-auto bg-card border">
          <thead>
            <tr className="text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Correo institucional</th>
              <th className="p-2">Código</th>
              <th className="p-2">Cédula</th>
              <th className="p-2">Roles</th>
              <th className="p-2">Programas</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.full_name}</td>
                <td className="p-2">{u.institutional_email}</td>
                <td className="p-2">{u.student_code}</td>
                <td className="p-2">{u.cedula}</td>
                <td className="p-2">{u.roles.join(", ")}</td>
                <td className="p-2">
                  {u.program_ids && u.program_ids.length > 0
                    ? u.program_ids.map(pid => programs.find(p=>p.id===pid)?.name || pid).join(', ')
                    : ''}
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex space-x-2">
                    <Button size="sm" type="button" onClick={() => handleEdit(u)}>
                      Edit
                    </Button>
                    <Button size="sm" type="button" variant="destructive" onClick={() => handleDelete(u.id)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
