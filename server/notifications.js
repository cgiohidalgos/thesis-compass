const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// Eventos de actas — solo para admins y evaluadores, nunca para estudiantes
const ACT_EVENTS = new Set(['act_signature']);

// Mapa de etiquetas legibles para cada tipo de evento
const EVENT_LABELS = {
  submitted:            'Tesis enviada a evaluación',
  admin_feedback:       'Comentario del administrador',
  admin_decision:       'Decisión del administrador',
  evaluators_assigned:  'Evaluadores asignados',
  review_ok:            'Revisión aprobada',
  review_fail:          'Revisión con observaciones',
  revision_submitted:   'Estudiante envió revisión',
  evaluation_submitted: 'Evaluación enviada',
  defense_scheduled:    'Sustentación programada',
  act_signature:        'Firma de acta registrada',
  status_changed:       'Estado de la tesis actualizado',
};

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === 'SSL',
    auth: { user: config.username, pass: config.password },
  });
}

function getSMTPConfig(db, userId) {
  if (userId) {
    const cfg = db.prepare('SELECT * FROM smtp_config WHERE user_id = ?').get(userId);
    if (cfg) return cfg;
  }
  // Intentar config default primero, luego cualquier config disponible
  return db.prepare('SELECT * FROM smtp_config WHERE is_default = 1').get()
    || db.prepare('SELECT * FROM smtp_config LIMIT 1').get()
    || null;
}

async function sendEmail(db, toEmail, subject, body, smtpOwnerId) {
  const config = getSMTPConfig(db, smtpOwnerId);
  if (!config) { console.error('[notify] Sin config SMTP'); return false; }
  try {
    const transporter = createTransport(config);
    const info = await transporter.sendMail({ from: config.username, to: toEmail, subject, html: body });
    console.log('[notify] Email enviado:', info.messageId);
    return true;
  } catch (err) {
    console.error('[notify] Error enviando email:', err.message);
    return false;
  }
}

function logNotification(db, userId, eventType, subject, body, relatedThesisId, error) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, event_type, subject, body, related_thesis_id, sent_at, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, eventType, subject, body, relatedThesisId || null, error ? null : Math.floor(Date.now()/1000), error || null, Math.floor(Date.now()/1000));
}

/**
 * Notifica un evento del timeline de una tesis.
 *
 * @param {object} db           - Instancia de better-sqlite3
 * @param {string} thesisId     - ID de la tesis
 * @param {string} eventType    - Tipo de evento (submitted, admin_feedback, etc.)
 * @param {string} description  - Descripción del evento (texto del timeline)
 * @param {string} triggeredBy  - user_id del usuario que disparó el evento
 */
async function notifyTimeline(db, thesisId, eventType, description, triggeredBy) {
  try {
    const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId);
    if (!thesis) return;

    const label = EVENT_LABELS[eventType] || eventType;
    const subject = `[SisTesis] ${label}: ${thesis.title}`;
    const body = `
      <div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#1a1a2e">${label}</h2>
        <p><strong>Tesis:</strong> ${thesis.title}</p>
        <p><strong>Detalle:</strong> ${description || label}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#888;font-size:12px">Sistema SisTesis — Facultad de Ingeniería USB Cali</p>
      </div>
    `;

    // Obtener listas de usuarios involucrados
    const studentIds   = db.prepare('SELECT student_id FROM thesis_students WHERE thesis_id = ?').all(thesisId).map(r => r.student_id);
    const evaluatorIds = db.prepare('SELECT evaluator_id FROM thesis_evaluators WHERE thesis_id = ?').all(thesisId).map(r => r.evaluator_id);
    const adminIds     = db.prepare("SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin','superadmin')").all().map(r => r.user_id);

    // Determinar destinatarios según el tipo de evento
    let recipientIds = [];

    switch (eventType) {
      // Tesis enviada a revisión: notificar a admins
      case 'submitted':
        recipientIds = [...adminIds];
        break;

      // Feedback del admin: notificar a estudiantes y evaluadores
      case 'admin_feedback':
        recipientIds = [...studentIds, ...evaluatorIds];
        break;

      // Decisión del admin (aprobar para sustentación o rechazar): notificar a estudiantes y evaluadores
      case 'admin_decision':
        recipientIds = [...studentIds, ...evaluatorIds];
        break;

      // Evaluadores asignados: notificar a los evaluadores asignados y a los estudiantes
      case 'evaluators_assigned':
        recipientIds = [...evaluatorIds, ...studentIds];
        break;

      // Revisión aprobada: notificar a estudiantes
      case 'review_ok':
        recipientIds = [...studentIds];
        break;

      // Revisión con observaciones: notificar a estudiantes
      case 'review_fail':
        recipientIds = [...studentIds];
        break;

      // Estudiante envió revisión: notificar a admins y evaluadores
      case 'revision_submitted':
        recipientIds = [...adminIds, ...evaluatorIds];
        break;

      // Evaluación enviada por evaluador: notificar solo a admins (NO estudiantes)
      case 'evaluation_submitted':
        recipientIds = [...adminIds];
        break;

      // Sustentación programada: notificar a todos
      case 'defense_scheduled':
        recipientIds = [...studentIds, ...evaluatorIds, ...adminIds];
        break;

      // Firma de acta: solo admins y evaluadores, NUNCA a estudiantes
      case 'act_signature':
        recipientIds = [...adminIds, ...evaluatorIds];
        break;

      // Cambio automático de estado: notificar a estudiantes, evaluadores y admins
      case 'status_changed':
        recipientIds = [...studentIds, ...evaluatorIds, ...adminIds];
        break;

      // Evento manual genérico (creado por admin/evaluador):
      // si es un evento de acta → sin estudiantes; si no → todos
      default:
        if (ACT_EVENTS.has(eventType)) {
          recipientIds = [...adminIds, ...evaluatorIds];
        } else {
          recipientIds = [...studentIds, ...evaluatorIds, ...adminIds];
        }
    }

    // Eliminar duplicados y al propio disparador (no se notifica a sí mismo)
    const uniqueIds = [...new Set(recipientIds)].filter(id => id !== triggeredBy);

    // Obtener config SMTP (usar la del disparador o la default del superadmin)
    const smtpOwnerId = triggeredBy || null;

    for (const recipientId of uniqueIds) {
      const user = db.prepare('SELECT id, institutional_email FROM users WHERE id = ?').get(recipientId);
      if (!user || !user.institutional_email) continue;

      const success = await sendEmail(db, user.institutional_email, subject, body, smtpOwnerId);
      logNotification(db, recipientId, eventType, subject, body, thesisId, success ? null : 'failed');
    }
  } catch (err) {
    console.error('[notify] Error en notifyTimeline:', err.message);
  }
}

/**
 * Inicia el cron job que envía recordatorios diarios a evaluadores.
 * Corre todos los días a las 8:00 AM.
 * Notifica evaluadores con due_date en 7, 3 o 1 día(s).
 */
function startReminderCron(db) {
  let cron;
  try { cron = require('node-cron'); } catch (e) {
    console.warn('[cron] node-cron no disponible, recordatorios desactivados');
    return;
  }

  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Ejecutando recordatorios de evaluaciones pendientes...');
    // due_date está guardado en segundos Unix (igual que el dashboard)
    const nowSec = Math.floor(Date.now() / 1000);
    const daySec = 24 * 3600;
    const windows = [
      { days: 1, label: 'mañana' },
      { days: 3, label: 'en 3 días' },
      { days: 7, label: 'en 7 días' },
    ];

    for (const { days, label } of windows) {
      const from = nowSec + (days - 1) * daySec;
      const to   = nowSec + days * daySec;

      const pending = db.prepare(`
        SELECT te.id, te.evaluator_id, te.thesis_id, te.due_date,
               t.title, u.institutional_email, u.full_name
        FROM thesis_evaluators te
        JOIN theses t ON t.id = te.thesis_id
        JOIN users u ON u.id = te.evaluator_id
        WHERE te.due_date IS NOT NULL
          AND te.due_date >= ? AND te.due_date < ?
          AND t.status NOT IN ('finalized','deleted')
      `).all(from, to);

      for (const row of pending) {
        if (!row.institutional_email) continue;

        // Evitar enviar recordatorio duplicado el mismo día
        const alreadySent = db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND event_type = 'reminder'
            AND related_thesis_id = ? AND created_at > ?
        `).get(row.evaluator_id, row.thesis_id, nowSec - daySec);
        if (alreadySent) continue;

        const subject = `[SisTesis] Recordatorio: evaluación vence ${label}`;
        const body = `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#1a1a2e">Recordatorio de evaluación pendiente</h2>
            <p>Hola <strong>${row.full_name || 'Evaluador'}</strong>,</p>
            <p>Tienes una evaluación pendiente que vence <strong>${label}</strong>:</p>
            <p style="font-size:16px;font-weight:bold">${row.title}</p>
            <p>Fecha límite: <strong>${new Date(row.due_date * 1000).toLocaleDateString('es-CO')}</strong></p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
            <p style="color:#888;font-size:12px">Sistema SisTesis — Facultad de Ingeniería USB Cali</p>
          </div>
        `;

        const success = await sendEmail(db, row.institutional_email, subject, body, null);
        logNotification(db, row.evaluator_id, 'reminder', subject, body, row.thesis_id, success ? null : 'failed');
        console.log(`[cron] Recordatorio enviado a ${row.institutional_email} (tesis: ${row.title})`);
      }
    }
    console.log('[cron] Recordatorios completados.');
  }, { timezone: 'America/Bogota' });

  console.log('[cron] Recordatorios automáticos activados (8:00 AM hora Bogotá)');
}

module.exports = { sendEmail, logNotification, notifyEvent: notifyTimeline, notifyTimeline, getSMTPConfig, createTransport, startReminderCron };
