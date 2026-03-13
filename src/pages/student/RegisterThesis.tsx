import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function RegisterThesis() {
  const navigate = useNavigate();
  const location = useLocation();
  const existing = location.state?.thesis;
  const { user } = useAuth();

  const [projectName, setProjectName] = useState(existing?.title || "");
  const [abstract, setAbstract] = useState(existing?.abstract || "");
  const [keywords, setKeywords] = useState(existing?.keywords || "");
  const [directors, setDirectors] = useState<string[]>(existing?.directors && existing.directors.length > 0 ? existing.directors : [""]);
  const [document, setDocument] = useState<File | null>(null);
  const [endorsement, setEndorsement] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [existingDoc, setExistingDoc] = useState<{file_name:string; file_url:string}|null>(null);
  const [existingEndorsement, setExistingEndorsement] = useState<{file_name:string; file_url:string}|null>(null);
  const [loading, setLoading] = useState(false);

  // companion information
  const [hasCompanion, setHasCompanion] = useState(false);
  const [companion, setCompanion] = useState<{ full_name: string; student_code: string; cedula: string; institutional_email: string; password: string }>({
    full_name: "",
    student_code: "",
    cedula: "",
    institutional_email: "",
    password: "",
  });

  // programs
  const [availablePrograms, setAvailablePrograms] = useState<{ id: string; name: string; reception_start?: string; reception_end?: string }[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
    existing?.programs ? existing.programs.map((p: any) => p.id) : []
  );

  const isEditable = !existing || existing.status === 'draft';

  useEffect(() => {
    // fetch list of programs
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/programs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const progs = await resp.json();
          setAvailablePrograms(progs);
        }
      } catch (err) {
        console.error('failed to load programs', err);
      }
    })();

    if (existing) {
      // if editing and there is a second student (companion)
      const other = existing.students?.find((s: any) => s.id !== user?.id);
      if (other) {
        setHasCompanion(true);
        setCompanion({
          full_name: other.name || "",
          student_code: other.student_code || "",
          cedula: other.cedula || "",
          institutional_email: other.institutional_email || "",
          password: "",
        });
      }
      // load existing files
      if (existing.files && existing.files.length > 0) {
        const docFile = existing.files.find((f: any) => f.file_type === 'document');
        const endorseFile = existing.files.find((f: any) => f.file_type === 'endorsement');
        const urlFile = existing.files.find((f: any) => f.file_type === 'url');
        if (docFile) setExistingDoc({ file_name: docFile.file_name, file_url: docFile.file_url });
        if (endorseFile) setExistingEndorsement({ file_name: endorseFile.file_name, file_url: endorseFile.file_url });
        if (urlFile) setUrl(urlFile.file_name || "");
      }
    }
  }, [existing, user]);

  const handleDirectorChange = (i: number, value: string) => {
    setDirectors((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  };
  const addDirector = () => setDirectors((prev) => [...prev, ""]);
  const removeDirector = (i: number) => setDirectors((prev) => prev.filter((_, idx) => idx !== i));

  const isProgramOpen = (prog: { reception_start?: string; reception_end?: string }) => {
    const now = Date.now();
    if (prog.reception_start && now < Date.parse(prog.reception_start)) return false;
    if (prog.reception_end && now > Date.parse(prog.reception_end)) return false;
    return true;
  };

  const closedPrograms = availablePrograms.filter((p) => !isProgramOpen(p));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) {
      // already processing a submit, ignore duplicate
      return;
    }
    // document only required when creating a new thesis
    if (!projectName.trim() || !abstract.trim() || (!document && !existing)) {
      toast.error(
        existing
          ? "Nombre y resumen son obligatorios"
          : "Nombre, resumen y documento de tesis son obligatorios"
      );
      return;
    }

    if (!existing && selectedPrograms.length > 0) {
      const closed = selectedPrograms
        .map((id) => availablePrograms.find((p) => p.id === id))
        .filter(Boolean)
        .filter((p) => !isProgramOpen(p as any)) as any[];
      if (closed.length) {
        toast.error(`No se puede registrar tesis en el/los programa(s) cerrados: ${closed.map((p) => p.name).join(', ')}`);
        setLoading(false);
        return;
      }
    }
    if (hasCompanion && (!companion.full_name || !companion.student_code || !companion.cedula)) {
      toast.error("Los datos del compañero (nombre, código y cédula) son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      let thesis;
      const body: any = { title: projectName, abstract };
      if (keywords.trim()) body.keywords = keywords.trim();
      if (hasCompanion && companion.full_name && companion.student_code) {
        // only include password if provided (optional during edit)
        body.companion = {
          full_name: companion.full_name,
          student_code: companion.student_code,
          cedula: companion.cedula || undefined,
          institutional_email: companion.institutional_email || undefined,
        } as any;
        if (companion.password) body.companion.password = companion.password;
      }

      if (existing) {
        // actualizar
        if (selectedPrograms.length) body.program_ids = selectedPrograms;
        console.log('updating thesis with', body);
        const resp = await fetch(`${API_BASE}/theses/${existing.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => null);
          throw new Error(errData?.error || "Error actualizando tesis");
        }
        // PUT returns {ok:true}; keep the id for subsequent file upload
        thesis = { ...existing, title: projectName, abstract, keywords };
      } else {
        // 1. Crear la tesis (POST /theses)
        if (selectedPrograms.length) body.program_ids = selectedPrograms;
        console.log('creating thesis with', body);
        const resp = await fetch(`${API_BASE}/theses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => null);
          console.error('thesis POST failed', resp.status, errData, body);
          throw new Error(errData?.error || "Error creando tesis");
        }
        thesis = await resp.json();
      }
      // 2. Subir archivos y directores (POST /theses/:id/files)
      const form = new FormData();
      form.append("project_name", projectName);
      form.append("abstract", abstract);
      form.append("directors", JSON.stringify(directors.filter((d) => d.trim())));
      if (document) form.append("document", document);
      if (endorsement) form.append("endorsement", endorsement);
      if (url) form.append("url", url);
      const uploadResp = await fetch(`${API_BASE}/theses/${thesis.id}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!uploadResp.ok) {
        // Si es una tesis nueva, eliminarla para evitar dejarla incompleta
        if (!existing) {
          await fetch(`${API_BASE}/theses/${thesis.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        const errData = await uploadResp.json().catch(() => null);
        throw new Error(errData?.error || "Error subiendo archivos. Intenta de nuevo.");
      }
      toast.success(existing ? "Tesis actualizada" : "Tesis registrada correctamente");
      navigate("/student");
    } catch (err: any) {
      console.error('handleSubmit caught', err);
      toast.error(err.message || "Error al registrar tesis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4 sm:px-6">
      <h1 className="font-heading text-2xl font-bold mb-4">
        {existing ? (isEditable ? 'Modificar Tesis' : 'Detalle de Tesis') : 'Registrar Nueva Tesis'}
      </h1>
      {existing && !isEditable && (
        <p className="text-sm text-red-500 mb-4">La tesis ya fue enviada y no puede modificarse.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-xl shadow-card p-4 sm:p-6">
        <div>
          <Label>Nombre del Proyecto</Label>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} required disabled={!isEditable} />
        </div>
        <div>
          <Label>Resumen</Label>
          <Textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} required disabled={!isEditable} />
        </div>
        <div>
          <Label>Palabras clave (separadas por coma)</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Machine learning, Deep Learning, Gestión de Procesos"
            disabled={!isEditable}
          />
        </div>
        {/* companion section */}
        <div>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={hasCompanion}
              onChange={() => setHasCompanion(!hasCompanion)}
              disabled={!isEditable}
              className="form-checkbox"
            />
            <span className="ml-2">Agregar/editar compañero</span>
          </label>
        </div>
        {hasCompanion && (
          <div className="space-y-2 border p-4 rounded">
            <div>
              <Label>Nombre del compañero</Label>
              <Input
                value={companion.full_name}
                onChange={(e) => setCompanion((c) => ({ ...c, full_name: e.target.value }))}
                required={isEditable}
                disabled={!isEditable}
              />
            </div>
            <div>
              <Label>Código del compañero</Label>
              <Input
                value={companion.student_code}
                onChange={(e) => setCompanion((c) => ({ ...c, student_code: e.target.value }))}
                required={isEditable}
                disabled={!isEditable}
              />
            </div>
            <div>
              <Label>Cédula del compañero</Label>
              <Input
                value={companion.cedula}
                onChange={(e) => setCompanion((c) => ({ ...c, cedula: e.target.value }))}
                required={hasCompanion && isEditable}
                disabled={!isEditable}
              />
            </div>
            <div>
              <Label>Correo institucional del compañero</Label>
              <Input
                type="email"
                placeholder="correo@usbcali.edu.co"
                value={companion.institutional_email}
                onChange={(e) => setCompanion((c) => ({ ...c, institutional_email: e.target.value }))}
                disabled={!isEditable}
              />
            </div>
            {isEditable && (
              <div>
                <Label>Contraseña del compañero</Label>
                <Input
                  type="password"
                  value={companion.password}
                  onChange={(e) => setCompanion((c) => ({ ...c, password: e.target.value }))}
                  placeholder={existing && companion.full_name ? "dejar en blanco para no cambiar" : undefined}
                  required={!existing || !companion.full_name}
                  disabled={!isEditable}
                />
              </div>
            )}
          </div>
        )}
        <div>
          <Label>Programa(s)</Label>
          <div className="text-sm text-muted-foreground mb-2">
            Selecciona el/los programa(s) a los que pertenece tu tesis. Si el período de recepción está cerrado, no podrás seleccionar ese programa.
          </div>
          {closedPrograms.length > 0 && (
            <div className="mb-2 p-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              <strong>Recepción cerrada para:</strong> {closedPrograms.map((p) => p.name).join(', ')}.
            </div>
          )}
          <div className="space-y-1">
            {availablePrograms.map((p) => {
              const open = isProgramOpen(p);
              return (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!isEditable || !open}
                    checked={selectedPrograms.includes(p.id)}
                    onChange={() => {
                      if (selectedPrograms.includes(p.id)) {
                        setSelectedPrograms((prev) => prev.filter((id) => id !== p.id));
                      } else {
                        setSelectedPrograms((prev) => [...prev, p.id]);
                      }
                    }}
                  />
                  <span className={open ? undefined : 'text-muted-foreground'}>
                    {p.name}
                    {p.reception_start && p.reception_end ? (
                      <span className="text-xs ml-2">({p.reception_start} → {p.reception_end})</span>
                    ) : null}
                    {!open && (
                      <span className="text-xs text-red-500 ml-2">(cerrado)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Directores</Label>
          {directors.map((d, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2 mb-2">
              <Input value={d} onChange={(e) => handleDirectorChange(i, e.target.value)} placeholder={`Director ${i + 1}`} required disabled={!isEditable} />
              {directors.length > 1 && (
                <Button type="button" variant="destructive" size="sm" className="sm:w-auto w-full" onClick={() => removeDirector(i)} disabled={!isEditable}>-</Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addDirector} disabled={!isEditable}>+ Agregar Director</Button>
        </div>
        <div>
          <Label>Documento de Tesis (PDF/DOCX)</Label>
          {existingDoc && !document && (
            <p className="text-sm text-blue-600 mb-1">
              📄 Archivo actual: <a href={`${API_BASE}${existingDoc.file_url}`} target="_blank" rel="noopener noreferrer" className="underline">{existingDoc.file_name}</a>
            </p>
          )}
          <Input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setDocument(e.target.files?.[0] || null)} required={!existing && !existingDoc} disabled={!isEditable} />
        </div>
        <div>
          <Label>Carta de Aval (PDF/DOCX)</Label>
          {existingEndorsement && !endorsement && (
            <p className="text-sm text-blue-600 mb-1">
              📄 Archivo actual: <a href={`${API_BASE}${existingEndorsement.file_url}`} target="_blank" rel="noopener noreferrer" className="underline">{existingEndorsement.file_name}</a>
            </p>
          )}
          <Input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setEndorsement(e.target.files?.[0] || null)} disabled={!isEditable} />
        </div>
        <div>
          <Label>Enlace URL (opcional)</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/..." disabled={!isEditable} />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !isEditable}>
          {loading ? "Registrando..." : existing ? "Guardar cambios" : "Registrar Tesis"}
        </Button>
      </form>
    </div>
  );
}
