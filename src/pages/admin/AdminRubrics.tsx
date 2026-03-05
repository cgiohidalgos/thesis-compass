import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

interface RubricSection {
  id: string;
  name: string;
  weight: number;
  criteria: Array<{ id: string; name: string; maxScore: number }>;
}

export default function AdminRubrics() {
  const { user, isSuper } = useAuth();
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [editingType, setEditingType] = useState<string>("");
  const [editSections, setEditSections] = useState<RubricSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const handleLoadDefaults = async () => {
    if (!selectedProgram) return;
    setLoadingDefaults(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/program-rubrics/${selectedProgram}/initialize`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error cargando rúbricas');
      const data = await resp.json();
      toast.success(data.message || 'Rúbricas cargadas');
      // Recargar rúbricas
      const rubResp = await fetch(`${API_BASE}/admin/program-rubrics/${selectedProgram}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (rubResp.ok) {
        const rubData = await rubResp.json();
        setRubrics(rubData);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setLoadingDefaults(false);
    }
  };

  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/programs`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const data = await resp.json();
          setPrograms(data);
          if (data.length > 0) {
            setSelectedProgram(data[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading programs:', err);
      }
    };
    loadPrograms();
  }, []);

  useEffect(() => {
    if (!selectedProgram) return;
    const loadRubrics = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/admin/program-rubrics/${selectedProgram}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const data = await resp.json();
          setRubrics(data);
        } else {
          toast.error('Error cargando rúbricas');
        }
      } catch (err: any) {
        toast.error(err.message || 'Error');
      } finally {
        setLoading(false);
      }
    };
    loadRubrics();
  }, [selectedProgram]);

  const handleEditRubric = (evaluationType: string, sections: RubricSection[]) => {
    setEditingType(evaluationType);
    setEditSections(JSON.parse(JSON.stringify(sections))); // deep copy
  };

  const handleSaveRubric = async () => {
    if (!selectedProgram || !editingType) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/program-rubrics/${selectedProgram}/${editingType}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ sections: editSections }),
      });
      if (!resp.ok) throw new Error('Error guardando rúbrica');
      const data = await resp.json();
      setRubrics(prev => {
        const idx = prev.findIndex(r => r.evaluation_type === editingType);
        if (idx >= 0) {
          prev[idx] = data;
        } else {
          prev.push(data);
        }
        return [...prev];
      });
      setEditingType("");
      setEditSections([]);
      toast.success('Rúbrica guardada');
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleSectionChange = (sectionIdx: number, field: string, value: any) => {
    const newSections = [...editSections];
    newSections[sectionIdx] = { ...newSections[sectionIdx], [field]: value };
    setEditSections(newSections);
  };

  const handleCriterionChange = (sectionIdx: number, criterionIdx: number, field: string, value: any) => {
    const newSections = [...editSections];
    const newCriteria = [...newSections[sectionIdx].criteria];
    newCriteria[criterionIdx] = { ...newCriteria[criterionIdx], [field]: value };
    newSections[sectionIdx] = { ...newSections[sectionIdx], criteria: newCriteria };
    setEditSections(newSections);
  };

  const handleAddSection = () => {
    const newSections = [...editSections];
    newSections.push({
      id: `s${Date.now()}`,
      name: 'Nueva Sección',
      weight: 10,
      criteria: [{ id: `c${Date.now()}`, name: 'Nuevo Criterio', maxScore: 5 }]
    });
    setEditSections(newSections);
  };

  const handleDeleteSection = (sectionIdx: number) => {
    const newSections = editSections.filter((_, idx) => idx !== sectionIdx);
    setEditSections(newSections);
  };

  const handleAddCriterion = (sectionIdx: number) => {
    const newSections = [...editSections];
    newSections[sectionIdx].criteria.push({
      id: `c${Date.now()}`,
      name: 'Nuevo Criterio',
      maxScore: 5
    });
    setEditSections(newSections);
  };

  const handleDeleteCriterion = (sectionIdx: number, criterionIdx: number) => {
    const newSections = [...editSections];
    newSections[sectionIdx].criteria = newSections[sectionIdx].criteria.filter((_, idx) => idx !== criterionIdx);
    setEditSections(newSections);
  };

  return (
    <AppLayout role={isSuper ? "superadmin" : "admin"}>
      <div className="max-w-4xl mx-auto p-6">
        <h2 className="text-3xl font-bold mb-6">Gestión de Rúbricas</h2>

        {/* Selector de programa */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Programa</label>
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="border rounded px-3 py-2 w-full max-w-xs"
          >
            {programs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground">Cargando rúbricas...</div>
        ) : (
          <div className="space-y-4">
            {/* Mostrar rúbricas existentes */}
            {rubrics.length > 0 ? (
              <Accordion type="single" collapsible className="w-full border rounded-lg overflow-hidden">
                {rubrics.map((rubric, idx) => (
                  <AccordionItem key={idx} value={`rubric-${idx}`} className="border-b">
                    <AccordionTrigger className="hover:no-underline py-3 px-4">
                      <div className="flex-1 text-left">
                        <span className="font-medium">
                          Rúbrica de {rubric.evaluation_type === 'document' ? 'Documento' : 'Sustentación'}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 space-y-3">
                      {editingType === rubric.evaluation_type ? (
                        // Modo edición
                        <div className="space-y-4">
                          {editSections.map((section, sectionIdx) => (
                            <div key={sectionIdx} className="border rounded p-3 space-y-2 bg-secondary/50">
                              <div className="flex items-end gap-2">
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs font-medium">Nombre Sección</label>
                                    <Input
                                      value={section.name}
                                      onChange={(e) => handleSectionChange(sectionIdx, 'name', e.target.value)}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium">Peso (%)</label>
                                    <Input
                                      type="number"
                                      value={section.weight}
                                      onChange={(e) => handleSectionChange(sectionIdx, 'weight', Number(e.target.value))}
                                      className="text-sm"
                                    />
                                  </div>
                                </div>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteSection(sectionIdx)}
                                  className="whitespace-nowrap"
                                >
                                  🗑️ Eliminar
                                </Button>
                              </div>

                              {/* Criterios */}
                              <div className="space-y-2 mt-3 p-2 bg-white/50 rounded">
                                <p className="text-xs font-medium">Criterios:</p>
                                {section.criteria.map((criterion, criterionIdx) => (
                                  <div key={criterionIdx} className="flex gap-2 items-end">
                                    <Input
                                      placeholder="Nombre del criterio"
                                      value={criterion.name}
                                      onChange={(e) => handleCriterionChange(sectionIdx, criterionIdx, 'name', e.target.value)}
                                      className="flex-1 text-sm"
                                    />
                                    <Input
                                      type="number"
                                      placeholder="Puntuación máxima"
                                      value={criterion.maxScore}
                                      onChange={(e) => handleCriterionChange(sectionIdx, criterionIdx, 'maxScore', Number(e.target.value))}
                                      className="w-24 text-sm"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteCriterion(sectionIdx, criterionIdx)}
                                      className="whitespace-nowrap text-red-600 hover:text-red-700"
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddCriterion(sectionIdx)}
                                  className="w-full text-sm"
                                >
                                  ➕ Agregar Criterio
                                </Button>
                              </div>
                            </div>
                          ))}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddSection}
                            className="w-full"
                          >
                            ➕ Agregar Sección
                          </Button>

                          <div className="flex gap-2 pt-3">
                            <Button
                              size="sm"
                              onClick={handleSaveRubric}
                              disabled={saving}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {saving ? 'Guardando...' : '✅ Guardar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingType("");
                                setEditSections([]);
                              }}
                            >
                              ❌ Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Modo lectura
                        <div className="space-y-3">
                          {rubric.sections_json.map((section: RubricSection, sectionIdx: number) => (
                            <div key={sectionIdx} className="border-l-4 border-blue-500 pl-3">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium">{section.name}</h4>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{section.weight}%</span>
                              </div>
                              <ul className="space-y-1 text-sm text-muted-foreground">
                                {section.criteria.map((c: any) => (
                                  <li key={c.id}>• {c.name} (máx. {c.maxScore})</li>
                                ))}
                              </ul>
                            </div>
                          ))}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditRubric(rubric.evaluation_type, rubric.sections_json)}
                            className="w-full"
                          >
                            ✏️ Editar
                          </Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No hay rúbricas guardadas aún para este programa.</p>
                <Button
                  onClick={handleLoadDefaults}
                  disabled={loadingDefaults}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loadingDefaults ? '⏳ Cargando...' : '📥 Cargar rúbricas por defecto'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
