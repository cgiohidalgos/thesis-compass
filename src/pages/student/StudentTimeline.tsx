import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function ScoreCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-slate-950 space-y-3">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{label}</h3>
      {children}
    </div>
  );
}

export default function StudentTimeline() {
  const [thesis, setThesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTheses = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Error consultando tesis");
        let data = await resp.json();
        if (data && data[0] && data[0].timeline && Array.isArray(data[0].timeline)) {
          data[0].timeline = data[0].timeline.map((e: any) => ({
            ...e,
            date: e.date ? new Date(e.date).toLocaleString() : undefined,
          }));
        }
        setThesis(data[0] || null);
      } catch (err: any) {
        toast.error(err.message || "Error consultando tesis");
      } finally {
        setLoading(false);
      }
    };
    fetchTheses();

    // fetch weights
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const r = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (r.ok) {
          const d = await r.json();
          setWeights({ doc: d.doc ?? 70, presentation: d.presentation ?? 30 });
        }
      } catch {}
    })();
  }, []);

  // handlers for the student revision form
  const handleRevisionFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setRevisionFiles(Array.from(files));
  };

  const submitRevision = async () => {
    if (!thesis) return;
    setSubmittingRevision(true);
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('comment', revisionComment);
      revisionFiles.forEach(f => form.append('files', f));
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/revision`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Error al enviar revisión');
      }
      toast.success('Revisión enviada');
      // clear form and reload thesis
      setRevisionComment('');
      setRevisionFiles([]);
      const r2 = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (r2.ok) {
        const data = await r2.json();
        setThesis(data[0] || null);
      }
    } catch (e:any) {
      toast.error(e.message || 'Error al enviar revisión');
    } finally {
      setSubmittingRevision(false);
    }
  };

  return (
    <AppLayout role="student">
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : !thesis ? (
          <div className="text-center py-8">
            <p className="mb-4">Aún no has registrado ninguna tesis.</p>
            <button className="btn" onClick={() => navigate("/student/register-thesis")}>Registrar Nueva Tesis</button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="font-heading text-2xl font-bold text-foreground">
                  Seguimiento de mi Tesis
                </h2>
                {thesis.revision_round > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">Ronda de revisión: {thesis.revision_round}</p>
                )}
                <StatusBadge status={thesis.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {thesis.title}
              </p>
              {thesis.students && thesis.students.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>s.name).join(', ')}
                </p>
              )}
              {thesis.directors && thesis.directors.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Director{thesis.directors.length>1?'es':''}:</strong> {thesis.directors.join(', ')}
                </p>
              )}
              {thesis.evaluators && thesis.evaluators.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Evaluadores asignados:</strong>{' '}
                  {thesis.evaluators.some((e:any)=>e.is_blind) ? (
                    <em>pares ciegos</em>
                  ) : (
                    thesis.evaluators.map((e:any)=>e.name).join(', ')
                  )}
                </p>
              )}
              {thesis.defense_date && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Sustentación:</strong> {new Date(thesis.defense_date).toLocaleString()} {thesis.defense_location ? `en ${thesis.defense_location}` : ''}
                  {thesis.defense_info && ` – ${thesis.defense_info}`}
                </p>
              )}
              {thesis.status !== 'draft' && (
                <p className="mt-2 text-sm text-red-600">
                  ⚠️ La tesis ya fue enviada a evaluación y no puede modificarse.
                </p>
              )}
            </div>
            {thesis.files && thesis.files.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold mb-2">Documentos enviados</h3>
                <ul className="space-y-1">
                  {thesis.files.map((f:any) => (
                    <li key={f.id}>
                      <a href={`${API_BASE}${f.file_url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {f.file_name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ThesisTimeline
              events={thesis.timeline || []}
              isBlindReview={thesis.evaluators && thesis.evaluators.some((e:any)=>e.is_blind)}
              isAdmin={false}
            />

            {/* revision submission form for students when applicable */}
            {(thesis.status === 'revision_minima' || thesis.status === 'revision_cuidados' || (thesis.timeline || []).some((e:any)=>e.status==='revision_submitted')) && (
              <div className="mt-8 p-6 border rounded-lg bg-white dark:bg-slate-950 space-y-4">
                <h3 className="text-lg font-bold">Enviar Revisión / Respuesta</h3>
                <p className="text-sm text-muted-foreground">
                  Si has recibido comentarios o archivos del evaluador, puedes responder aquí subiendo tus archivos y escribiendo tus observaciones.
                </p>
                <Textarea
                  value={revisionComment}
                  onChange={(e) => setRevisionComment(e.target.value)}
                  placeholder="Escribe tus comentarios o explicación aquí..."
                  className="min-h-[80px]"
                />
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Archivos de revisión</label>
                  <input type="file" multiple onChange={handleRevisionFiles} />
                  {revisionFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {revisionFiles.map((f, i) => (
                        <li key={i} className="text-sm">{f.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                  disabled={submittingRevision}
                  onClick={submitRevision}
                >
                  {submittingRevision ? 'Enviando...' : 'Enviar Revisión'}
                </button>
              </div>
            )}

            {/* Score summaries */}
            {(() => {
              const evals: any[] = thesis.evaluations || [];
              const isBlind = thesis.evaluators?.some((e:any) => e.is_blind);
              const docEvals = evals.filter((e:any) => e.evaluation_type !== 'presentation' && e.final_score != null);
              const presEvals = evals.filter((e:any) => e.evaluation_type === 'presentation' && e.final_score != null);
              const w = weights;
              const docAvg = docEvals.length ? docEvals.reduce((a:number,b:any) => a + Number(b.final_score), 0) / docEvals.length : null;
              const presAvg = presEvals.length ? presEvals.reduce((a:number,b:any) => a + Number(b.final_score), 0) / presEvals.length : null;

              // Per-evaluator totals
              const evaluatorIds = [...new Set(evals.map((e:any) => e.evaluator_id))];
              const perEvaluator = evaluatorIds.map(eid => {
                const evName = isBlind ? null : (evals.find((e:any) => e.evaluator_id === eid)?.evaluator_name || 'Evaluador');
                const doc = evals.find((e:any) => e.evaluator_id === eid && e.evaluation_type !== 'presentation');
                const pres = evals.find((e:any) => e.evaluator_id === eid && e.evaluation_type === 'presentation');
                const dScore = doc?.final_score != null ? Number(doc.final_score) : null;
                const pScore = pres?.final_score != null ? Number(pres.final_score) : null;
                let total: number | null = null;
                if (dScore != null && pScore != null) {
                  total = dScore * (w.doc / 100) + pScore * (w.presentation / 100);
                } else if (dScore != null) {
                  total = dScore;
                }
                return { name: evName, docScore: dScore, presScore: pScore, total };
              });

              const hasDefense = !!thesis.defense_date;
              const finalScore = thesis.weighted?.finalScore;

              return (
                <div className="space-y-4 mt-6">
                  {/* Document scores */}
                  {docEvals.length > 0 && (
                    <ScoreCard label="Calificaciones del Documento">
                      {docEvals.map((ev:any, i:number) => (
                        <div key={ev.id || i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isBlind ? `Evaluador ${i+1}` : ev.evaluator_name}</span>
                          <span className="font-semibold">{Number(ev.final_score).toFixed(2)}</span>
                        </div>
                      ))}
                      {docAvg != null && (
                        <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
                          <span>Promedio Documento</span>
                          <span>{docAvg.toFixed(2)} / 5.00</span>
                        </div>
                      )}
                    </ScoreCard>
                  )}

                  {/* Presentation scores */}
                  {presEvals.length > 0 && (
                    <ScoreCard label="Calificaciones de la Sustentación">
                      {presEvals.map((ev:any, i:number) => (
                        <div key={ev.id || i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isBlind ? `Evaluador ${i+1}` : ev.evaluator_name}</span>
                          <span className="font-semibold">{Number(ev.final_score).toFixed(2)}</span>
                        </div>
                      ))}
                      {presAvg != null && (
                        <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
                          <span>Promedio Sustentación</span>
                          <span>{presAvg.toFixed(2)} / 5.00</span>
                        </div>
                      )}
                    </ScoreCard>
                  )}

                  {/* Consolidated */}
                  {docAvg != null && (hasDefense ? presAvg != null : true) && finalScore != null && (
                    <ScoreCard label="Calificación Consolidada">
                      <div className="text-center mb-3">
                        <span className="text-3xl font-black text-primary">{Number(finalScore).toFixed(2)}</span>
                        <span className="text-lg text-muted-foreground"> / 5.00</span>
                      </div>
                      <div className="text-sm text-center font-semibold text-muted-foreground mb-2">Nota Final Ponderada</div>
                      {hasDefense && presAvg != null ? (
                        <p className="text-sm text-center text-muted-foreground">
                          Cálculo: ({docAvg.toFixed(2)} × {w.doc}%) + ({presAvg.toFixed(2)} × {w.presentation}%) = {Number(finalScore).toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-sm text-center text-muted-foreground">
                          Cálculo: promedio documento = {docAvg.toFixed(2)}
                        </p>
                      )}

                      {perEvaluator.length > 0 && (
                        <div className="border-t pt-3 mt-3 space-y-2">
                          {perEvaluator.map((pe, i) => (
                            <div key={i} className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{pe.name || `Evaluador ${i+1}`}:</span>{' '}
                              {pe.docScore != null && <>documento {pe.docScore.toFixed(2)}</>}
                              {pe.presScore != null && <>, sustentación {pe.presScore.toFixed(2)}</>}
                              {pe.total != null && <>, total <span className="font-semibold text-foreground">{pe.total.toFixed(2)}</span></>}
                              {pe.docScore != null && pe.presScore != null && (
                                <div className="text-xs ml-4 text-muted-foreground/70">
                                  ({pe.docScore.toFixed(2)} × {w.doc}% + {pe.presScore.toFixed(2)} × {w.presentation}%)
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScoreCard>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </AppLayout>
  );
}
