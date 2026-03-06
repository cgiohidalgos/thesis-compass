import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { FileText, Users, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function AdminDashboard() {
  const { isSuper } = useAuth();
  const [stats, setStats] = useState<any[]>([]);
  const [byProgram, setByProgram] = useState<any[]>([]);
  const [evalStats, setEvalStats] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);

  const navigate = useNavigate();
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [sresp, tresp] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers: { Authorization: token ? `Bearer ${token}` : '' } }),
        fetch(`${API_BASE}/theses`, { headers: { Authorization: token ? `Bearer ${token}` : '' } }),
      ]);
      if (sresp.ok) {
        const sjson = await sresp.json();
        console.log('stats response', sjson);
        const baseStats = [
          { label: 'Total Tesis', value: sjson.totalTheses, icon: FileText, color: 'text-info' },
          { label: 'En Evaluación', value: sjson.inEvaluation, icon: Clock, color: 'text-warning' },
          { label: 'Finalizadas', value: sjson.finalized, icon: CheckCircle2, color: 'text-success' },
          { label: 'Evaluadores', value: sjson.evaluators, icon: Users, color: 'text-accent' },
        ];
        // due stats
        const dueStats = [];
        if (sjson.overdue !== undefined) {
          dueStats.push({ label: 'Evaluaciones vencidas', value: sjson.overdue, icon: Clock, color: 'text-destructive', link: '/admin/evaluations?due=overdue' });
        }
        if (sjson.due7 !== undefined) {
          dueStats.push({ label: 'Vence <7d', value: sjson.due7, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=7' });
        }
        if (sjson.due15 !== undefined) {
          dueStats.push({ label: 'Vence <15d', value: sjson.due15, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=15' });
        }
        if (sjson.due30 !== undefined) {
          dueStats.push({ label: 'Vence <30d', value: sjson.due30, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=30' });
        }
        setStats(baseStats.concat(dueStats));
        if (sjson.byProgram) setByProgram(sjson.byProgram);        if (sjson.evaluatorStats) setEvalStats(sjson.evaluatorStats);      }
      if (tresp.ok) {
        const tjson = await tresp.json();
        setTheses(tjson);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Panel de Administración
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Gestión integral del proceso de evaluación de tesis.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`bg-card rounded-lg border shadow-card p-5 ${stat.link ? 'cursor-pointer hover:bg-accent/10' : ''}`}
              onClick={() => {
                if (stat.link) navigate(stat.link);
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Overview chart */}
        <div className="mb-8 h-64 bg-card rounded-lg p-4 shadow-card">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats}
                dataKey="value"
                nameKey="label"
                outerRadius={80}
                fill="#8884d8"
                label
              >
                {stats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#8884d8','#ffc658','#82ca9d','#a4de6c'][index % 4]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown by program */}
        {byProgram.length > 0 && (
          <>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
              Estadísticas por Programa {isSuper ? "(todos los programas)" : "(mis programas)"}
            </h3>
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 text-left">Programa</th>
                    <th className="p-2">En evaluación</th>
                    <th className="p-2">Finalizadas</th>
                    <th className="p-2">Otras</th>
                  </tr>
                </thead>
                <tbody>
                  {byProgram.map((p) => {
                    const counts = p.counts || {};
                    const inEval = (counts.submitted || 0) + (counts.revision_minima || 0) + (counts.revision_cuidados || 0);
                    // treat both status keys that represent completion
                    const fin = (counts.sustentacion || 0) + (counts.finalized || 0);
                    // other statuses are any count not in the above and not deleted
                    const other = Object.entries(counts)
                      .filter(([k]) => !['submitted','revision_minima','revision_cuidados','sustentacion','finalized'].includes(k))
                      .reduce((sum, [,v]) => sum + v, 0);
                    return (
                      <tr key={p.program_id} className="border-t">
                        <td className="p-2">{p.program_name || 'Sin programa'}</td>
                        <td className="p-2 text-center">{inEval}</td>
                        <td className="p-2 text-center">{fin}</td>
                        <td className="p-2 text-center">{other}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* chart per program */}
            <div className="mb-8 h-64 bg-card rounded-lg p-4 shadow-card">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProgram.map(p => {
                  const counts = p.counts || {};
                  const inEval = (counts.submitted || 0) + (counts.revision_minima || 0) + (counts.revision_cuidados || 0);
                  const fin = counts.sustentacion || 0;
                  const other = Object.entries(counts)
                    .filter(([k]) => !['submitted','revision_minima','revision_cuidados','sustentacion'].includes(k))
                    .reduce((sum, [,v]) => sum + v, 0);
                  return {
                    name: p.program_name,
                    inEval,
                    finalized: fin,
                    other,
                  };
                })}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="inEval" stackId="a" fill="#8884d8" />
                  <Bar dataKey="finalized" stackId="a" fill="#82ca9d" />
                  <Bar dataKey="other" stackId="a" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* evaluator breakdown */}
            {evalStats.length > 0 && (
              <>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
                  Estadísticas por Evaluador
                </h3>
                <div className="overflow-x-auto mb-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="p-2 text-left">Evaluador</th>
                        <th className="p-2">Tesis asignadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalStats.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="p-2">{e.name}</td>
                          <td className="p-2 text-center">{e.theses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* Recent Theses */}
        <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
          Tesis Recientes
        </h3>
        <div className="space-y-4">
          {theses.map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo="/admin/theses"
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
