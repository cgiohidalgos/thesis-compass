import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { useAuth } from "@/hooks/useAuth";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function AdminThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [thesis, setThesis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewItems, setReviewItems] = useState<{id:string,label:string}[]>([]);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [actaStatus, setActaStatus] = useState<any>(null);
  const [overrideScore, setOverrideScore] = useState<number | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  
  // Estado para firma digital con certificado
  const [digitalSignStatus, setDigitalSignStatus] = useState<any>(null);
  const [digitalSignFile, setDigitalSignFile] = useState<File | null>(null);
  const [digitalSignerRole, setDigitalSignerRole] = useState<string>("");
  const [digitalSignerName, setDigitalSignerName] = useState<string>("");
  const [loadingDigitalSign, setLoadingDigitalSign] = useState(false);
  const [digitalProgDirectorName, setDigitalProgDirectorName] = useState<string>("");

  // Estado para carta meritoria
  const [meritoriaStatus, setMeritoriaStatus] = useState<any>(null);
  const [meritoriaSignFile, setMeritoriaSignFile] = useState<File | null>(null);
  const [meritoriaSignerName, setMeritoriaSignerName] = useState<string>("");
  const [loadingMeritoria, setLoadingMeritoria] = useState(false);

  // Estado para enlaces de firma compartibles
  const [generatedSigningLinks, setGeneratedSigningLinks] = useState<Record<string, {url: string; copied: boolean}>>({});

  // compute consolidated averages and breakdown for display
  const consolidated = (() => {
    if (!thesis || !thesis.evaluations || thesis.evaluations.length === 0) {
      return null;
    }
    const docScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type !== 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const presScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type === 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const docAvg = docScores.length ? docScores.reduce((a:number,b:number)=>a+b,0)/docScores.length : 0;
    const presAvg = presScores.length ? presScores.reduce((a:number,b:number)=>a+b,0)/presScores.length : 0;
    let finalWeighted = thesis.defense_date
      ? ((docAvg * (weights.doc/100)) + (presAvg * (weights.presentation/100)))
      : docAvg;
    // apply override if present and thesis finalized
    if (thesis.status === 'finalized' && thesis.final_weighted_override != null) {
      finalWeighted = thesis.final_weighted_override;
    }
    const byEvaluator: Record<string,{doc:number|null;pres:number|null}> = {};
    thesis.evaluations.forEach((ev:any)=>{
      const name = ev.evaluator_name || 'Evaluador';
      if (!byEvaluator[name]) byEvaluator[name] = {doc:null,pres:null};
      if (ev.evaluation_type === 'presentation') {
        byEvaluator[name].pres = ev.final_score;
      } else {
        byEvaluator[name].doc = ev.final_score;
      }
    });
    return {docAvg,presAvg,finalWeighted,byEvaluator};
  })();

  const { isSuper } = useAuth();

  const saveOverride = async () => {
    if (!id) return;
    setSavingOverride(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/theses/${id}/final-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ override: overrideScore }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error guardando nota');
      }
      toast.success('Nota final actualizada');
      fetchThesis();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const fetchThesis = async () => {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudo cargar la tesis');
      const data = await resp.json();
      // convert timeline dates to readable form
      if (data.timeline && Array.isArray(data.timeline)) {
        data.timeline = data.timeline.map((e: any) => ({
          ...e,
          date: e.date ? new Date(e.date).toLocaleString() : undefined,
        }));
      }
      setThesis(data);
      setOverrideScore(data.final_weighted_override ?? null);

      const actaResp = await fetch(`${API_BASE}/theses/${id}/acta/status`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (actaResp.ok) {
        const acta = await actaResp.json();
        setActaStatus(acta);
      }

      // Cargar estado de firma digital
      try {
        const digitalResp = await fetch(`${API_BASE}/theses/${id}/acta/digital-signature-status`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (digitalResp.ok) {
          const digitalData = await digitalResp.json();
          setDigitalSignStatus(digitalData);
        } else {
          const errText = await digitalResp.text();
          console.error('digital-signature-status error:', digitalResp.status, errText);
          setDigitalSignStatus({ allSigned: false, digitalSignatures: [], pendingSigners: [], _error: true });
        }
      } catch (digitalErr) {
        console.error('digital-signature-status fetch failed:', digitalErr);
        setDigitalSignStatus({ allSigned: false, digitalSignatures: [], pendingSigners: [], _error: true });
      }

      // Cargar estado carta meritoria
      try {
        const merResp = await fetch(`${API_BASE}/theses/${id}/meritoria/status`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (merResp.ok) {
          const merData = await merResp.json();
          setMeritoriaStatus(merData);
        }
      } catch {}
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Generar enlace de firma compartible
  // Normaliza la URL reemplazando el origen del servidor por el del navegador actual
  const normalizeSignUrl = (signUrl: string) => {
    try {
      const parsed = new URL(signUrl);
      const browserBase = `${window.location.protocol}//${window.location.host}`;
      return browserBase + parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return signUrl;
    }
  };

  const handleGenerateSigningLink = async (signerName: string, signerRole: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}/generate-signing-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ signerName, signerRole }),
      });
      if (!resp.ok) throw new Error('Error generando enlace');
      const { signUrl } = await resp.json();
      setGeneratedSigningLinks(prev => ({
        ...prev,
        [signerName]: { url: normalizeSignUrl(signUrl), copied: false }
      }));
      toast.success(`Enlace generado para ${signerName}`);
    } catch (e: any) {
      toast.error(e.message || 'Error generando enlace');
    }
  };

  // Copiar enlace al portapapeles
  const handleCopyLink = (signerName: string) => {
    const link = generatedSigningLinks[signerName]?.url;
    if (link) {
      navigator.clipboard.writeText(link).then(() => {
        setGeneratedSigningLinks(prev => ({
          ...prev,
          [signerName]: { ...prev[signerName], copied: true }
        }));
        setTimeout(() => {
          setGeneratedSigningLinks(prev => ({
            ...prev,
            [signerName]: { ...prev[signerName], copied: false }
          }));
        }, 2000);
      });
    }
  };

  // Generar enlace de firma compartible para meritoria
  const handleGenerateMeritoriaLink = async (signerName: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}/meritoria/generate-signing-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ signerName, signerRole: 'director' }),
      });
      if (!resp.ok) throw new Error('Error generando enlace');
      const { signUrl } = await resp.json();
      setGeneratedSigningLinks(prev => ({
        ...prev,
        [signerName]: { url: normalizeSignUrl(signUrl), copied: false }
      }));
      toast.success(`Enlace generado para ${signerName}`);
    } catch (e: any) {
      toast.error(e.message || 'Error generando enlace');
    }
  };

  useEffect(() => {
    fetchThesis();
    // load review checklist template (admins allowed too)
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/super/review-items`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const items = await resp.json();
          setReviewItems(items);
          const init: Record<string, boolean> = {};
          items.forEach((it:any) => { init[it.id] = false; });
          setChecklist(init);
        }
      } catch (e) {
        console.error('failed to load review items', e);
      }
    })();
    // also load evaluation weights if superadmin
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const data = await resp.json();
          setWeights({ doc: data.doc, presentation: data.presentation });
        }
      } catch (e) {
        console.error('failed to load weights', e);
      }
    })();
  }, [id]);

  const markNonCompliant = async () => {
    if (!thesis) return;
    if (!comment.trim()) {
      toast.error('Ingrese un comentario');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/theses/${thesis.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ ok: false, comment }),
      });
      toast.success('Tesis regresada al estudiante');
      navigate('/admin/theses');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const assignEvaluators = () => {
    if (!thesis) return;
    navigate(`/admin/evaluators?thesis=${thesis.id}`);
  };

  // component for scheduling the defense date/location
  const DefenseScheduler = ({ thesis, onScheduled }: any) => {
    const [date, setDate] = useState<string>(thesis.defense_date ? new Date(thesis.defense_date).toISOString().slice(0,16) : '');
    const [location, setLocation] = useState<string>(thesis.defense_location || '');
    const [info, setInfo] = useState<string>(thesis.defense_info || '');
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      if (!date || !location) {
        toast.error('Ingrese fecha y lugar');
        return;
      }
      setSaving(true);
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE}/theses/${thesis.id}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
          body: JSON.stringify({ date, location, info }),
        });
        toast.success('Sustentación programada');
        onScheduled();
      } catch (e:any) {
        toast.error(e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha y hora</label>
          <input
            type="datetime-local"
            className="border p-2 w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Lugar</label>
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Ej. Sala 101"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Información adicional</label>
          <textarea
            className="border p-2 w-full"
            placeholder="Detalles adicionales, enlace virtual, etc."
            value={info}
            onChange={(e) => setInfo(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={saving || !date || !location}>
          Guardar programación
        </Button>
      </div>
    );
  };

  const handleDelete = async () => {
    if (!thesis) return;
    if (!confirm("¿Eliminar esta tesis? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error eliminando tesis');
      toast.success('Tesis eliminada');
      navigate('/admin/theses');
    } catch (e:any) {
      toast.error(e.message);
    }
  };

  if (!thesis) return null;

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6 bg-card p-6 rounded-lg shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <h2 className="font-heading text-2xl font-bold">Detalle de Tesis</h2>
            <Button variant="destructive" size="sm" onClick={handleDelete}>Eliminar tesis</Button>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Estado:</strong> <span className="capitalize">{thesis.status}</span>
          </p>
          <p className="text-lg font-semibold mb-2">
            <strong>Título:</strong> {thesis.title}
          </p>
          {thesis.students && thesis.students.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>s.name).join(', ')}
            </p>
          )}
          {thesis.directors && thesis.directors.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Director{thesis.directors.length>1?'es':''}:</strong> {thesis.directors.join(', ')}
            </p>
          )}
          {thesis.programs && thesis.programs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong>Programas:</strong> {thesis.programs.map((p:any)=>p.name).join(', ')}
            </p>
          )}
        </div>
        {thesis.keywords && (
          <div className="mb-4">
            <strong>Palabras clave:</strong> {thesis.keywords}
          </div>
        )}
        {thesis.evaluators && thesis.evaluators.length > 0 && (
          <div className="mb-6">
            <strong>Evaluadores asignados:</strong>{' '}
            {thesis.evaluators.map((e:any) =>
              e.is_blind ? 'Par ciego' : e.name
            ).join(', ')}
            {thesis.evaluators.some((e:any) => e.due_date) && (
              <p className="text-sm text-muted-foreground">
                <strong>Fecha(s) límite:</strong> {thesis.evaluators
                  .map((e:any) => e.due_date)
                  .filter(Boolean)
                  .map((d:any) => { const ms = d > 1e12 ? d : d * 1000; return new Date(ms).toLocaleDateString('es-CO'); })
                  .join(', ')}
              </p>
            )}

            {/* per-evaluator status accordions */}
            <Accordion type="single" collapsible className="mt-4 w-full border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
              {thesis.evaluators.map((ev:any) => {
                const docSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // pull the actual evaluation objects to show later
                const docEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // compute due-date status badge when evaluation still pending
                let dueStatus: JSX.Element | null = null;
                if (ev.due_date && !(docSent && (thesis.defense_date ? docSent && presSent : docSent))) {
                  const now = new Date();
                  const duems = ev.due_date > 1e12 ? ev.due_date : ev.due_date * 1000;
                  const due = new Date(duems);
                  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                  if (diff < 0) {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600 border border-red-200">
                        Atrasado
                      </span>
                    );
                  } else if (diff <= 4) {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">
                        Casi vence
                      </span>
                    );
                  } else {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-muted-foreground border border-border">
                        Pendiente
                      </span>
                    );
                  }
                }
                return (
                  <AccordionItem key={ev.id} value={ev.id} className="border-b px-2">
                    <AccordionTrigger className="hover:no-underline py-4 flex justify-between items-center">
                      <span>{ev.is_blind ? 'Evaluador (Par ciego)' : ev.name}</span>
                      {dueStatus}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 space-y-4">
                      {/* document rubric accordion if sent*/}
                      {docSent && docEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-doc`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Documento</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={docEval.concept || null}
                                initialFinalScore={docEval.final_score}
                                initialSections={docEval ? defaultRubric.map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = docEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={docEval.general_observations || ""}
                                initialFiles={docEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {/* presentation rubric accordion if sent*/}
                      {presSent && presEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-pres`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Sustentación</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={presEval.concept || null}
                                initialFinalScore={presEval.final_score}
                                initialSections={presEval ? presentationRubric.map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = presEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={presEval.general_observations || ""}
                                initialFiles={presEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
        {thesis.files && thesis.files.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Documentos enviados</h3>
            <ul className="list-disc list-inside space-y-1">
              {thesis.files.map((f:any)=> (
                <li key={f.id}>
                  <a href={`${API_BASE}${f.file_url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {f.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* defense card like evaluator */}
        {thesis.defense_date && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50/50 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
            <h3 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
              Información de la Sustentación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fecha y Hora</p>
                <p className="text-sm font-medium">{new Date(thesis.defense_date).toLocaleString()}</p>
              </div>
              {thesis.defense_location && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lugar</p>
                  <p className="text-sm font-medium">{thesis.defense_location}</p>
                </div>
              )}
            </div>
            {thesis.defense_info && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Observaciones generales</p>
                <p className="text-sm font-medium whitespace-pre-wrap">{thesis.defense_info}</p>
              </div>
            )}
          </div>
        )}

        {thesis?.status === 'finalized' && (
          <div className="mb-6">
            <h3 className="text-sm font-bold">Ajuste de Nota Final Ponderada</h3>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="5"
                value={overrideScore !== null ? overrideScore : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setOverrideScore(v === '' ? null : parseFloat(v));
                }}
                className="border p-1 rounded w-24"
                disabled={savingOverride}
              />
              <Button size="sm" onClick={saveOverride} disabled={savingOverride}>
                {savingOverride ? 'Guardando...' : 'Guardar'}
              </Button>
              {overrideScore !== null && (
                <Button size="sm" variant="ghost" onClick={() => setOverrideScore(null)} disabled={savingOverride}>
                  Restablecer
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overrideScore !== null
                ? 'Valor manual aplicado al cálculo.'
                : 'Se usa el cálculo automático según evaluaciones.'}
            </p>
          </div>
        )}
        {/* consolidated score for admin */}
        {consolidated && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="text-4xl font-black text-primary">
                      {consolidated.finalWeighted.toFixed(2)}
                      <span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span>
                    </p>
                    <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
                    {overrideScore != null ? (
                      <>Nota fijada manualmente: {overrideScore.toFixed(2)}</>
                    ) : (
                      <>Cálculo: ({consolidated.docAvg.toFixed(2)} x {weights.doc}%) {thesis.defense_date ? `+ (${consolidated.presAvg.toFixed(2)} x ${weights.presentation}%)` : ''} = {consolidated.finalWeighted.toFixed(2)}</>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  {Object.entries(consolidated.byEvaluator).map(([name, scores]) => {
                    const docScore = scores.doc != null ? scores.doc : null;
                    const presScore = scores.pres != null ? scores.pres : null;
                    const totalScore = thesis.defense_date
                      ? ((docScore||0)*(weights.doc/100) + (presScore||0)*(weights.presentation/100))
                      : docScore;
                    return (
                      <div key={name} className="mb-2">
                        <strong>{name}</strong>: documento {docScore!==null?docScore.toFixed(2):'-'}, sustentación {presScore!==null?presScore.toFixed(2):'-'}, total {totalScore!==null?totalScore.toFixed(2):'-'}
                        <div className="text-xs text-muted-foreground">
                          ({docScore!==null?`${docScore.toFixed(2)} x ${weights.doc}%`:'0'}{thesis.defense_date?` + ${presScore!==null?`${presScore.toFixed(2)} x ${weights.presentation}%`:'0'}`:''})
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* only show revision checklist if there are no evaluators yet */}
        {(!thesis.evaluators || thesis.evaluators.length === 0) && (
          <div className="mb-4">
            <strong>Revisión</strong>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              {reviewItems.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!checklist[item.id]}
                    onChange={() => setChecklist((c) => ({ ...c, [item.id]: !c[item.id] }))}
                    className="form-checkbox"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {thesis.timeline && thesis.timeline.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Historial</h3>
            <ThesisTimeline events={thesis.timeline} isAdmin={true} />
          </div>
        )}
        {thesis.status === 'submitted' && (
          <>
            <div className="mb-4">
              {reviewItems.length > 0 && reviewItems.every(it => checklist[it.id]) ? (
                <Button
                  onClick={assignEvaluators}
                  disabled={loading}
                >
                  Cumple todo
                </Button>
              ) : (
                <>
                  <textarea
                    className="w-full border p-2 mb-2"
                    placeholder="Comentario al regresar"
                    value={comment}
                    onChange={(e)=>setComment(e.target.value)}
                  />
                  <Button variant="destructive" onClick={markNonCompliant} disabled={loading}>Regresar al estudiante</Button>
                </>
              )}
            </div>

          </>
        )}
        {/* schedule defense when status indicates sustentación */}
        {thesis.status === 'sustentacion' && (
          <div className="mb-6 border p-4 rounded bg-info/10">
            <h3 className="font-semibold mb-2">Programar Sustentación</h3>
            {thesis.defense_date ? (
              <div className="space-y-2">
                <p>
                  <strong>Fecha y hora:</strong>{' '}{new Date(thesis.defense_date).toLocaleString()}
                </p>
                {thesis.defense_location && (
                  <p><strong>Lugar:</strong> {thesis.defense_location}</p>
                )}
                {thesis.defense_info && (
                  <p><strong>Información adicional:</strong> {thesis.defense_info}</p>
                )}
                <Button size="sm" variant="outline" onClick={() => {
                  // clear to allow reschedule
                  setThesis((t:any) => ({ ...t, defense_date: null, defense_location: '', defense_info: '' }));
                }}>
                  Modificar
                </Button>
              </div>
            ) : (
              <DefenseScheduler thesis={thesis} onScheduled={fetchThesis} />
            )}
          </div>
        )}
        {actaStatus?.allEvaluatorsDone && (
          <div className="mb-6 border p-4 rounded bg-success/5">
            <h3 className="font-semibold mb-2">🔐 Firma Digital del Acta</h3>

            {/* Estado de firmas */}
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium">Estado de firmas:</p>
              {digitalSignStatus?.digitalSignatures?.length > 0 ? (
                digitalSignStatus.digitalSignatures.map((sig: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-green-600 flex-1">
                      ✓ {(sig.signer_role === 'evaluator' || sig.signer_role === 'evaluador') ? 'Evaluador' : sig.signer_role === 'director' ? 'Director' : sig.signer_role === 'program_director' ? 'Dir. Programa' : sig.signer_role}: {sig.signer_name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-5 px-1 text-xs"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar firma de ${sig.signer_name}?`)) return;
                        const token = localStorage.getItem('token');
                        await fetch(`${API_BASE}/theses/${thesis.id}/acta/delete-signature`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                          body: JSON.stringify({ signer_name: sig.signer_name, signer_role: sig.signer_role }),
                        });
                        loadData();
                      }}
                    >
                      🗑
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No hay firmas digitales registradas aún.</p>
              )}
              {!digitalSignStatus?.allSigned && digitalSignStatus?.pendingSigners?.length > 0 && (
                <div>
                  <p className="text-xs text-orange-600 mt-1 mb-3">
                    Pendientes: {digitalSignStatus.pendingSigners.map((p: any) => p.name).join(', ')}
                  </p>

                  {/* Sección de enlaces compartibles */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-900 mb-2">🔗 Generar enlaces de firma sin login:</p>
                    {digitalSignStatus.pendingSigners.map((pending: any) => (
                      <div key={pending.name} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-medium">{pending.name}</p>
                          <p className="text-muted-foreground">{pending.role === 'evaluator' ? 'Evaluador' : pending.role === 'director' ? 'Director' : 'Director del Programa'}</p>
                        </div>
                        {generatedSigningLinks[pending.name]?.url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(pending.name)}
                            className="whitespace-nowrap"
                          >
                            {generatedSigningLinks[pending.name].copied ? '✅ Copiado!' : '📋 Copiar enlace'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateSigningLink(pending.name, pending.role)}
                            className="whitespace-nowrap"
                          >
                            🔗 Generar enlace
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Si todas las firmas están completas */}
            {digitalSignStatus?.allSigned && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
                <p className="text-sm font-medium text-green-700 mb-2">✅ Todas las firmas han sido registradas</p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/download-final-signed`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `acta-final-firmada-${thesis.id}.pdf`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar');
                    }
                  }}>
                    📄 Descargar PDF final firmado
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/export?format=word`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `acta-${thesis.id}.docx`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar Word');
                    }
                  }}>
                    📝 Descargar Word
                  </Button>
                </div>
              </div>
            )}

            {!digitalSignStatus?.allSigned && <div>
              <p className="text-xs text-muted-foreground mb-3">
                Descargue el PDF, fírmelo con Adobe Acrobat usando su certificado digital y súbalo de vuelta.
              </p>

              {/* Descargar PDF para firmar */}
              <div className="mb-3 space-y-2">
                <label className="text-xs font-medium block">Director del Programa (para incluir en el acta):</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 text-sm w-full"
                  placeholder="Nombre del Director del Programa"
                  value={digitalProgDirectorName}
                  onChange={(e) => setDigitalProgDirectorName(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const url = new URL(`${API_BASE}/theses/${thesis.id}/acta/download-for-signing`);
                    if (digitalProgDirectorName) {
                      url.searchParams.set('prog_director_name', digitalProgDirectorName);
                    }
                    const resp = await fetch(url.toString(), {
                      headers: { Authorization: token ? `Bearer ${token}` : '' },
                    });
                    if (!resp.ok) throw new Error('No se pudo descargar');
                    const blob = await resp.blob();
                    const dlUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = dlUrl;
                    a.download = `acta-${thesis.id}-para-firmar.pdf`;
                    a.click();
                    window.URL.revokeObjectURL(dlUrl);
                  } catch (e: any) {
                    toast.error(e.message || 'Error al descargar');
                  }
                }}>
                  📥 Descargar PDF para firmar
                </Button>
              </div>

              {/* Subir PDF firmado */}
              <div className="space-y-2">
                <p className="text-xs font-medium">Subir PDF firmado:</p>
                <select
                  className="border rounded px-2 py-1 text-sm w-full"
                  value={digitalSignerRole}
                  onChange={(e) => {
                    setDigitalSignerRole(e.target.value);
                    if (e.target.value === 'director' && actaStatus?.directors?.length) {
                      setDigitalSignerName(actaStatus.directors[0]);
                    } else {
                      setDigitalSignerName("");
                    }
                  }}
                >
                  <option value="">Seleccione su rol...</option>
                  <option value="director">Director de tesis</option>
                  <option value="program_director">Director del programa</option>
                </select>

                {digitalSignerRole === 'director' && actaStatus?.directors?.length > 1 && (
                  <select
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={digitalSignerName}
                    onChange={(e) => setDigitalSignerName(e.target.value)}
                  >
                    {actaStatus.directors.map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}

                {digitalSignerRole === 'program_director' && (
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="Nombre del director del programa"
                    value={digitalSignerName}
                    onChange={(e) => setDigitalSignerName(e.target.value)}
                  />
                )}

                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setDigitalSignFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />

                <Button
                  size="sm"
                  disabled={!digitalSignFile || !digitalSignerRole || loadingDigitalSign}
                  onClick={async () => {
                    if (!digitalSignFile || !digitalSignerRole) return;
                    setLoadingDigitalSign(true);
                    try {
                      const token = localStorage.getItem('token');
                      const form = new FormData();
                      form.append('signed_pdf', digitalSignFile);
                      form.append('signer_role', digitalSignerRole);
                      if (digitalSignerName) form.append('signer_name', digitalSignerName);

                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/upload-signed`, {
                        method: 'POST',
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                        body: form,
                      });
                      const data = await resp.json();
                      if (!resp.ok) throw new Error(data.error || 'No se pudo subir');

                      toast.success('Firma digital registrada correctamente');
                      setDigitalSignFile(null);
                      setDigitalSignerRole("");
                      setDigitalSignerName("");
                      fetchThesis();
                    } catch (e: any) {
                      toast.error(e.message || 'Error al subir PDF firmado');
                    } finally {
                      setLoadingDigitalSign(false);
                    }
                  }}
                >
                  {loadingDigitalSign ? 'Subiendo...' : '📤 Subir PDF firmado'}
                </Button>
              </div>
            </div>}
          </div>
        )}

        {/* CARTA MERITORIA — visible solo si nota >= 4.8 */}
        {meritoriaStatus?.qualifies && (
          <div className="mb-6 border p-4 rounded bg-yellow-50">
            <h3 className="font-semibold mb-1">🏅 Carta de Recomendación Meritoria</h3>
            <p className="text-xs text-muted-foreground mb-3">
              La tesis obtuvo una nota de <strong>{Number(meritoriaStatus.score).toFixed(2)}</strong>, por lo que requiere carta de recomendación meritoria firmada por los directores.
            </p>

            {/* Estado de firmas */}
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium">Firmas de directores:</p>
              {meritoriaStatus.directors.map((d: string) => {
                const signed = meritoriaStatus.signatures.some((s: any) => s.signer_name.toLowerCase() === d.toLowerCase());
                return (
                  <div key={d} className={`text-xs ${signed ? 'text-green-600' : 'text-orange-500'}`}>
                    {signed ? '✓' : '○'} {d}
                  </div>
                );
              })}
            </div>

            {/* Sección de enlaces compartibles para meritoria */}
            {!meritoriaStatus.allSigned && meritoriaStatus.pendingDirectors?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3 space-y-2">
                <p className="text-xs font-medium text-blue-900 mb-2">🔗 Generar enlaces de firma sin login:</p>
                {meritoriaStatus.pendingDirectors.map((pending: string) => (
                  <div key={pending} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-medium">{pending}</p>
                      <p className="text-muted-foreground">Director</p>
                    </div>
                    {generatedSigningLinks[pending]?.url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyLink(pending)}
                        className="whitespace-nowrap"
                      >
                        {generatedSigningLinks[pending].copied ? '✅ Copiado!' : '📋 Copiar enlace'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateMeritoriaLink(pending)}
                        className="whitespace-nowrap"
                      >
                        🔗 Generar enlace
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Banner firmada completa */}
            {meritoriaStatus.allSigned && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
                <p className="text-sm font-medium text-green-700 mb-2">✅ Carta firmada por todos los directores</p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-final?format=pdf`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}.pdf`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📄 Descargar PDF firmado</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-final?format=word`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}.docx`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📝 Descargar Word</Button>
                </div>
              </div>
            )}

            {/* Formulario subida y descarga para firmar */}
            {!meritoriaStatus.allSigned && (
              <div>
                <div className="flex gap-2 flex-wrap mb-3">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-for-signing?format=pdf`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}-para-firmar.pdf`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📥 Descargar PDF para firmar</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-for-signing`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}-para-firmar.docx`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📥 Descargar Word para firmar</Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Subir PDF firmado por director:</p>
                  <select
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={meritoriaSignerName}
                    onChange={(e) => setMeritoriaSignerName(e.target.value)}
                  >
                    <option value="">Seleccione director...</option>
                    {meritoriaStatus.pendingDirectors.map((d: string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setMeritoriaSignFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!meritoriaSignFile || !meritoriaSignerName || loadingMeritoria}
                    onClick={async () => {
                      if (!meritoriaSignFile || !meritoriaSignerName) return;
                      setLoadingMeritoria(true);
                      try {
                        const token = localStorage.getItem('token');
                        const form = new FormData();
                        form.append('signed_pdf', meritoriaSignFile);
                        form.append('signer_name', meritoriaSignerName);
                        const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/upload-signed`, {
                          method: 'POST',
                          headers: { Authorization: token ? `Bearer ${token}` : '' },
                          body: form,
                        });
                        const data = await resp.json();
                        if (!resp.ok) throw new Error(data.error || 'No se pudo subir');
                        toast.success('Firma registrada en carta meritoria');
                        setMeritoriaSignFile(null);
                        setMeritoriaSignerName('');
                        fetchThesis();
                      } catch (e: any) {
                        toast.error(e.message || 'Error al subir');
                      } finally {
                        setLoadingMeritoria(false);
                      }
                    }}
                  >
                    {loadingMeritoria ? 'Subiendo...' : '📤 Registrar firma'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {(thesis.status === 'revision_minima' || thesis.status === 'revision_cuidados') && (
          <div className="mb-6 border p-4 rounded bg-warning/10">
            <h3 className="font-semibold mb-2">Enviar retroalimentación al estudiante</h3>
            <textarea
              className="w-full border p-2 mb-2"
              placeholder="Comentario para el estudiante"
              value={comment}
              onChange={(e)=>setComment(e.target.value)}
            />
            <input type="file" onChange={(e)=>{
              const files=e.target.files; if(files&&files[0]){
                const form=new FormData(); form.append('file', files[0]);
                const token=localStorage.getItem('token');
                fetch(`${API_BASE}/theses/${thesis.id}/feedback`,{method:'POST',headers:{Authorization:token?`Bearer ${token}`:''},body: form}).then(()=>toast.success('Feedback enviado'));
              }
            }} />
            <div className="mt-4 flex gap-2">
              <Button onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'sustentacion', comment }),
                });
                toast.success('Tesis movida a sustentación');
                fetchThesis && fetchThesis();
              }}>Aprobar para Sustentación</Button>
              <Button variant="destructive" onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'reject', comment }),
                });
                toast.success('Tesis regresada a borrador');
                fetchThesis && fetchThesis();
              }}>Regresar a borrador</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
