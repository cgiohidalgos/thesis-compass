import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function EvaluatorDashboard() {
  const [theses, setTheses] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  const fetchSession = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const resp = await fetch(`${API_BASE}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const json = await resp.json();
        setUser(json.session?.user || null);
      }
    } catch (e) {
      console.error('session error', e);
    }
  };

  const fetchTheses = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudieron cargar las tesis');
      let data = await resp.json();
      if (user) {
        data = data.map((t:any) => {
          const myEvals = Array.isArray(t.evaluations)
            ? t.evaluations.filter((e:any) => String(e.evaluator_id) === String(user.id))
            : [];
          const currentRound = Number(t.revision_round || 0);
          const myCurrentRoundEvals = myEvals.filter((e:any) => Number(e.revision_round || 0) === currentRound);
          const hasDoc = myCurrentRoundEvals.some((e:any) => e.evaluation_type !== 'presentation');
          const hasPres = myCurrentRoundEvals.some((e:any) => e.evaluation_type === 'presentation');
          // completed when doc eval exists and either no defense scheduled or presentation also done
          const completed = hasDoc && (!t.defense_date || hasPres);
          return {
            ...t,
            evaluated: myCurrentRoundEvals.length > 0,
            evalCompleted: completed,
          };
        });
      }
      // remove duplicates by id just in case backend returns them
      const seen = new Set();
      data = data.filter((t:any) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      // Fetch acta status for each thesis to know if it has a complete acta
      const token2 = localStorage.getItem('token');
      const actaPromises = data.map(async (t:any) => {
        try {
          const r = await fetch(`${API_BASE}/theses/${t.id}/acta/status`, {
            headers: { Authorization: token2 ? `Bearer ${token2}` : '' },
          });
          if (r.ok) {
            const st = await r.json();
            return { id: t.id, allSigned: !!st.allSigned };
          }
        } catch {}
        return { id: t.id, allSigned: false };
      });
      const actaResults = await Promise.all(actaPromises);
      const actaMap = Object.fromEntries(actaResults.map(a => [a.id, a.allSigned]));
      data = data.map((t:any) => ({ ...t, hasActa: !!actaMap[t.id] }));

      setTheses(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    fetchTheses();
  }, [user]);

  return (
    <AppLayout role="evaluator">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Tesis Asignadas
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Trabajos pendientes de evaluación académica.
        </p>

        {theses.length > 0 ? (
          <div className="space-y-4">
            {theses.map((thesis) => (
              <ThesisCard
                key={thesis.id}
                thesis={thesis}
                linkTo={`/evaluator/rubric/${thesis.id}`}
                evaluated={thesis.evaluated}
                evalCompleted={thesis.evalCompleted}
                hasActa={thesis.hasActa}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">No tienes tesis asignadas por el momento.</p>
        )}
      </div>
    </AppLayout>
  );
}
