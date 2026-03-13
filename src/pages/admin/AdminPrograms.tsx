import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function AdminPrograms() {
  const [programs, setPrograms] = useState<{ id: string; name: string; admin_user_ids?: string[]; reception_start?: string; reception_end?: string }[]>([]);
  const [admins, setAdmins] = useState<{id:string;full_name:string;institutional_email:string}[]>([]);
  const [name, setName] = useState("");
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [receptionStart, setReceptionStart] = useState<string | null>(null);
  const [receptionEnd, setReceptionEnd] = useState<string | null>(null);
  const [showSelect, setShowSelect] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleAdminSelection = (id: string) => {
    setAdminIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // also fetch admins list
      const resp2 = await fetch(`${API_BASE}/users?role=admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp2.ok) setAdmins(await resp2.json());
      if (!resp.ok) throw new Error("Error cargando programas");
      const data = await resp.json();
      setPrograms(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar programas");
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleAddOrUpdate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      let resp;
      const payload: any = { name: name.trim(), reception_start: receptionStart, reception_end: receptionEnd };
      if (adminIds.length) payload.admin_user_ids = adminIds;
      if (editingId) {
        resp = await fetch(`${API_BASE}/programs/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        resp = await fetch(`${API_BASE}/programs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "Error guardando programa");
      }
      const prog = await resp.json();
      if (editingId) {
        setPrograms((ps) => ps.map(p => p.id === prog.id ? prog : p));
        setAdminIds([]);
        toast.success("Programa actualizado");
      } else {
        setPrograms((p) => [...p, prog]);
        setAdminIds([]);
        toast.success("Programa agregado");
      }
      setName("");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar programa");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (p: {id:string;name:string;admin_user_ids?:string[]; reception_start?: string; reception_end?: string}) => {
    setEditingId(p.id);
    setName(p.name);
    setAdminIds(p.admin_user_ids || []);
    setReceptionStart(p.reception_start || null);
    setReceptionEnd(p.reception_end || null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este programa?")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error eliminando programa");
      setPrograms((ps) => ps.filter(p => p.id !== id));
      toast.success("Programa eliminado");
      if (editingId === id) {
        setEditingId(null);
        setName("");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar programa");
    }
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-lg mx-auto">
        <h2 className="font-heading text-2xl font-bold mb-4">Categorías / Programas</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Define los programas disponibles para seleccionar al registrar tesis.
        </p>
        <div className="space-y-3 mb-6">
          {programs.map((p) => (
            <div key={p.id} className="bg-card p-3 rounded flex justify-between items-center">
              <div>
                <span>{p.name}</span>
                {p.reception_start && p.reception_end && (
                  <p className="text-xs text-muted-foreground">
                    Recepción: {p.reception_start} → {p.reception_end}
                  </p>
                )}
                {p.admin_user_ids && p.admin_user_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    admins: {p.admin_user_ids.map(id => admins.find(a=>a.id===id)?.institutional_email || id).join(', ')}
                  </p>
                )}
              </div>
              <div className="space-x-2">
                <Button size="sm" variant="ghost" onClick={() => handleEdit(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-start">
          {/* button opens a dialog to pick admins */}
          <Dialog open={showSelect} onOpenChange={setShowSelect}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                {adminIds.length > 0
                  ? `${adminIds.length} admin${adminIds.length > 1 ? 'es' : ''}`
                  : 'Asignar admins'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">Seleccionar administradores</DialogTitle>
              </DialogHeader>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                {admins.map((a) => {
                  const isSelected = adminIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAdminSelection(a.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/30'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {a.full_name || a.institutional_email}
                        </p>
                      </div>
                      {isSelected && <span className="text-xs font-medium text-accent">✓</span>}
                    </button>
                  );
                })}
                {admins.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay administradores disponibles
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="Nuevo programa"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={receptionStart || ''}
                onChange={(e) => setReceptionStart(e.target.value || null)}
                placeholder="Inicio recepción"
              />
              <Input
                type="date"
                value={receptionEnd || ''}
                onChange={(e) => setReceptionEnd(e.target.value || null)}
                placeholder="Fin recepción"
              />
            </div>
          </div>
          <Button onClick={handleAddOrUpdate} disabled={loading || !name.trim()}>
            {editingId ? 'Actualizar' : 'Agregar'}
          </Button>
          {editingId && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setName('');
                setAdminIds([]);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
        {/* display currently selected admin emails */}
        {adminIds.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            admins: {adminIds.map(id => admins.find(a => a.id === id)?.institutional_email || id).join(', ')}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
