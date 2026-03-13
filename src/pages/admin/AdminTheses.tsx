import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import StatusBadge from "@/components/thesis/StatusBadge";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function AdminTheses() {
  const [theses, setTheses] = useState<any[]>([]);

  const fetchTheses = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error cargando tesis');
      const data = await resp.json();
      setTheses(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDeleteThesis = async (id: string) => {
    if (!confirm('¿Eliminar esta tesis? Esta acción no se puede deshacer.')) return;
    // optimista: quitar del listado inmediatamente
    setTheses((prev) => prev.filter((t) => t.id !== id));
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (resp.ok) {
        toast.success('Tesis eliminada');
        fetchTheses();
      } else if (resp.status === 404) {
        toast.error('La tesis ya no existe');
        fetchTheses();
      } else {
        const text = await resp.text().catch(() => '');
        throw new Error(text || 'Error eliminando tesis');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    fetchTheses();
  }, []);

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
              Gestión de Tesis
            </h2>
            <p className="text-sm text-muted-foreground">
              Todas las tesis registradas en el sistema.
            </p>
          </div>
          <a
            href={`${API_BASE}/admin/reports/theses`}
            download
            onClick={(e) => {
              const token = localStorage.getItem('token');
              if (!token) { e.preventDefault(); toast.error('Sin sesión'); return; }
              // Usar fetch para incluir el token
              e.preventDefault();
              fetch(`${API_BASE}/admin/reports/theses`, {
                headers: { Authorization: `Bearer ${token}` },
              }).then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `tesis-${Date.now()}.csv`; a.click();
                URL.revokeObjectURL(url);
              }).catch(() => toast.error('Error exportando'));
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </a>
        </div>

        <div className="space-y-4">
          {theses.map((thesis) => (
            <div key={thesis.id} className="relative overflow-hidden">
              <ThesisCard
                thesis={thesis}
                linkTo={`/admin/theses/${thesis.id}`}
              />
              <button
                onClick={() => handleDeleteThesis(thesis.id)}
                className="absolute top-2 right-2 text-red-600 hover:text-red-800 bg-white rounded-full p-1 shadow"
                title="Eliminar tesis"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
