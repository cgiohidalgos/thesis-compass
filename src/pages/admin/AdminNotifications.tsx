import { useState, useEffect } from 'react';
import { getApiBase } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AppLayout from '@/components/layout/AppLayout';

const EVENT_LABELS: Record<string, string> = {
  submitted:            'Tesis enviada',
  admin_feedback:       'Feedback del admin',
  admin_decision:       'Decisión del admin',
  evaluators_assigned:  'Evaluadores asignados',
  review_ok:            'Revisión aprobada',
  review_fail:          'Revisión con observaciones',
  revision_submitted:   'Revisión del estudiante',
  evaluation_submitted: 'Evaluación enviada',
  defense_scheduled:    'Sustentación programada',
  act_signature:        'Firma de acta',
  status_changed:       'Estado actualizado',
  reminder:             'Recordatorio automático',
};

interface Notification {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  event_type: string;
  subject: string;
  sent_at: number | null;
  error: string | null;
  created_at: number;
  related_thesis_id: string | null;
}

export default function AdminNotifications() {
  const API_BASE = getApiBase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/admin/notifications?limit=200`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (res.ok) setNotifications(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'sent' && !n.sent_at) return false;
    if (filter === 'failed' && !n.error) return false;
    if (eventFilter !== 'all' && n.event_type !== eventFilter) return false;
    return true;
  });

  const eventTypes = [...new Set(notifications.map(n => n.event_type))];

  const sentCount   = notifications.filter(n => n.sent_at && !n.error).length;
  const failedCount = notifications.filter(n => n.error).length;

  const handleResend = async (id: string) => {
    setResending(id);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/notifications/${id}/resend`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error reenviando');
      }
      toast.success('Notificación reenviada');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending(null);
    }
  };

  return (
    <AppLayout role="admin">
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Historial de Notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            {sentCount} enviadas · {failedCount} fallidas · {notifications.length} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>Actualizar</Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'sent', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {{ all: 'Todas', sent: 'Enviadas', failed: 'Fallidas' }[f]}
          </button>
        ))}
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          className="px-3 py-1 rounded-full text-sm border border-border bg-background"
        >
          <option value="all">Todos los eventos</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay notificaciones.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Destinatario</th>
                  <th className="text-left px-4 py-3 font-medium">Evento</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Asunto</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(n => (
                  <tr key={n.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(n.created_at * 1000).toLocaleString('es-CO', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{n.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{n.email || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {EVENT_LABELS[n.event_type] || n.event_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                      {n.subject}
                    </td>
                    <td className="px-4 py-3">
                      {n.error ? (
                        <Badge variant="destructive">Fallida</Badge>
                      ) : n.sent_at ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Enviada</Badge>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(n.error || !n.sent_at) && (
                        <Button size="sm" variant="outline" onClick={() => handleResend(n.id)} disabled={resending === n.id}>
                          {resending === n.id ? 'Reenviando…' : 'Reenviar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </AppLayout>
  );
}
