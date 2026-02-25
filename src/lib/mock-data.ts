export type ThesisStatus =
  | "submitted"
  | "admin_review"
  | "evaluators_assigned"
  | "academic_evaluation"
  | "concept_issued"
  | "corrections_requested"
  | "approved_for_defense"
  | "defense_evaluated"
  | "act_signed"
  | "finalized";

export type EvaluatorConcept = "accepted" | "minor_changes" | "major_changes";

export interface TimelineEvent {
  id: string;
  status: ThesisStatus;
  label: string;
  date: string;
  actor: string;
  actorRole: "admin" | "evaluator" | "system";
  observations?: string;
  attachments?: string[];
  completed: boolean;
  active: boolean;
}

export interface Student {
  id: string;
  name: string;
  code: string;
  cedula: string;
}

export interface Evaluator {
  id: string;
  name: string;
  email: string;
  specialty: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  maxScore: number;
  score?: number;
  observations?: string;
}

export interface RubricSection {
  id: string;
  name: string;
  weight: number;
  criteria: RubricCriterion[];
}

export interface Thesis {
  id: string;
  title: string;
  students: Student[];
  status: ThesisStatus;
  evaluators: Evaluator[];
  submittedAt: string;
  timeline: TimelineEvent[];
  documentUrl?: string;
}

export const statusLabels: Record<ThesisStatus, string> = {
  submitted: "Tesis Enviada",
  admin_review: "Revisión Administrativa",
  evaluators_assigned: "Evaluadores Asignados",
  academic_evaluation: "En Evaluación Académica",
  concept_issued: "Concepto Emitido",
  corrections_requested: "Correcciones Solicitadas",
  approved_for_defense: "Aprobada para Sustentación",
  defense_evaluated: "Sustentación Evaluada",
  act_signed: "Acta Firmada",
  finalized: "Proceso Finalizado",
};

export const statusColors: Record<ThesisStatus, string> = {
  submitted: "info",
  admin_review: "warning",
  evaluators_assigned: "info",
  academic_evaluation: "warning",
  concept_issued: "accent",
  corrections_requested: "destructive",
  approved_for_defense: "success",
  defense_evaluated: "success",
  act_signed: "success",
  finalized: "success",
};

export const defaultRubric: RubricSection[] = [
  {
    id: "a",
    name: "Fundamentación Problémica",
    weight: 30,
    criteria: [
      { id: "a1", name: "Definición del problema", maxScore: 5 },
      { id: "a2", name: "Justificación", maxScore: 5 },
      { id: "a3", name: "Marco teórico", maxScore: 5 },
      { id: "a4", name: "Estado del arte", maxScore: 5 },
      { id: "a5", name: "Referencias bajo norma IEEE", maxScore: 5 },
    ],
  },
  {
    id: "b",
    name: "Propuesta Metodológica",
    weight: 30,
    criteria: [
      { id: "b1", name: "Objetivo general", maxScore: 5 },
      { id: "b2", name: "Objetivos específicos", maxScore: 5 },
      { id: "b3", name: "Coherencia metodológica", maxScore: 5 },
      { id: "b4", name: "Cumplimiento de objetivos", maxScore: 5 },
    ],
  },
  {
    id: "c",
    name: "Aspectos Disciplinares",
    weight: 30,
    criteria: [
      { id: "c1", name: "Implementación técnica", maxScore: 5 },
      { id: "c2", name: "Métricas y validación", maxScore: 5 },
      { id: "c3", name: "Análisis de resultados", maxScore: 5 },
      { id: "c4", name: "Discusión técnica", maxScore: 5 },
    ],
  },
  {
    id: "d",
    name: "Presentación del Documento",
    weight: 10,
    criteria: [
      { id: "d1", name: "Redacción", maxScore: 5 },
      { id: "d2", name: "Cumplimiento de normas", maxScore: 5 },
    ],
  },
];

export const mockTimeline: TimelineEvent[] = [
  {
    id: "1",
    status: "submitted",
    label: "Tesis Enviada",
    date: "2025-01-15 09:30",
    actor: "Sistema",
    actorRole: "system",
    observations: "Documento recibido correctamente. Formato PDF y DOCX verificados.",
    completed: true,
    active: false,
  },
  {
    id: "2",
    status: "admin_review",
    label: "Revisión Administrativa",
    date: "2025-01-17 14:20",
    actor: "Dra. María González",
    actorRole: "admin",
    observations: "Documentación completa. Cumple requisitos formales.",
    completed: true,
    active: false,
  },
  {
    id: "3",
    status: "evaluators_assigned",
    label: "Evaluadores Asignados",
    date: "2025-01-20 10:00",
    actor: "Dra. María González",
    actorRole: "admin",
    observations: "Evaluadores: Dr. Carlos Pérez y Dra. Ana Rodríguez.",
    completed: true,
    active: false,
  },
  {
    id: "4",
    status: "academic_evaluation",
    label: "En Evaluación Académica",
    date: "2025-01-25 08:00",
    actor: "Sistema",
    actorRole: "system",
    observations: "Rúbrica enviada a evaluadores. Plazo: 15 días hábiles.",
    completed: true,
    active: false,
  },
  {
    id: "5",
    status: "concept_issued",
    label: "Concepto Emitido",
    date: "2025-02-10 16:45",
    actor: "Dr. Carlos Pérez",
    actorRole: "evaluator",
    observations: "Nota ponderada: 4.2/5.0 — Cambios menores recomendados.",
    completed: true,
    active: false,
  },
  {
    id: "6",
    status: "approved_for_defense",
    label: "Aprobada para Sustentación",
    date: "2025-02-20 11:00",
    actor: "Dra. María González",
    actorRole: "admin",
    completed: false,
    active: true,
  },
  {
    id: "7",
    status: "defense_evaluated",
    label: "Sustentación Evaluada",
    date: "",
    actor: "",
    actorRole: "system",
    completed: false,
    active: false,
  },
  {
    id: "8",
    status: "act_signed",
    label: "Acta Firmada",
    date: "",
    actor: "",
    actorRole: "system",
    completed: false,
    active: false,
  },
  {
    id: "9",
    status: "finalized",
    label: "Proceso Finalizado",
    date: "",
    actor: "",
    actorRole: "system",
    completed: false,
    active: false,
  },
];

export const mockTheses: Thesis[] = [
  {
    id: "1",
    title: "Sistema de Detección de Intrusiones Basado en Aprendizaje Profundo para Redes IoT",
    students: [
      { id: "s1", name: "Juan David Martínez López", code: "2020134567", cedula: "1098765432" },
      { id: "s2", name: "Laura Camila Torres Ríos", code: "2020145678", cedula: "1087654321" },
    ],
    status: "approved_for_defense",
    evaluators: [
      { id: "e1", name: "Dr. Carlos Pérez", email: "cperez@univ.edu", specialty: "Redes y Seguridad" },
      { id: "e2", name: "Dra. Ana Rodríguez", email: "arodriguez@univ.edu", specialty: "Machine Learning" },
    ],
    submittedAt: "2025-01-15",
    timeline: mockTimeline,
  },
  {
    id: "2",
    title: "Plataforma de Telemedicina con Análisis Predictivo de Signos Vitales",
    students: [
      { id: "s3", name: "Andrés Felipe Guzmán", code: "2019156789", cedula: "1076543210" },
    ],
    status: "academic_evaluation",
    evaluators: [
      { id: "e3", name: "Dr. Roberto Sánchez", email: "rsanchez@univ.edu", specialty: "Sistemas de Información" },
      { id: "e4", name: "Dra. Patricia Méndez", email: "pmendez@univ.edu", specialty: "IA en Salud" },
    ],
    submittedAt: "2025-02-01",
    timeline: mockTimeline.slice(0, 4).map((e, i) => ({
      ...e,
      active: i === 3,
      completed: i < 3,
    })),
  },
  {
    id: "3",
    title: "Desarrollo de una Aplicación Móvil para Gestión de Residuos Sólidos Urbanos",
    students: [
      { id: "s4", name: "María José Herrera", code: "2020167890", cedula: "1065432109" },
      { id: "s5", name: "Diego Alejandro Vargas", code: "2020178901", cedula: "1054321098" },
    ],
    status: "admin_review",
    evaluators: [],
    submittedAt: "2025-02-18",
    timeline: mockTimeline.slice(0, 2).map((e, i) => ({
      ...e,
      active: i === 1,
      completed: i < 1,
    })),
  },
];
