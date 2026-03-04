const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { imageSize } = require('image-size');

const app = express();
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// other middleware and helper functions might go here


// Subida de archivos y registro de directores para tesis
// moved below authMiddleware and upload definitions

// ...existing code...

const db = require('./db');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = '7d';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

const toDateTime = (ts) => ts ? new Date(Number(ts)).toLocaleString('es-CO') : '';
const toDateOnly = (ts) => ts ? new Date(Number(ts)).toLocaleDateString('es-CO') : '';

function scoreClassification(score) {
  if (score >= 4.8) return 'APROBADA MERITORIA';
  if (score >= 3.0) return 'APROBADA';
  return 'NO APROBADA';
}

function scoreToSpanishText(score) {
  const digits = ['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
  const fixed = Number(score || 0).toFixed(2);
  const [whole, decimals] = fixed.split('.');
  return `${digits[Number(whole)] || whole} PUNTO ${digits[Number(decimals[0])] || decimals[0]} ${digits[Number(decimals[1])] || decimals[1]}`;
}

function computeFinalWeightedForThesis(thesisId) {
  const docWeight = Number((db.prepare('SELECT value FROM settings WHERE key = ?').get('doc_weight') || {}).value || 70);
  const presWeight = Number((db.prepare('SELECT value FROM settings WHERE key = ?').get('presentation_weight') || {}).value || 30);
  const thesis = db.prepare('SELECT defense_date FROM theses WHERE id = ?').get(thesisId);
  const evaluations = db.prepare(
    `SELECT e.final_score, e.evaluation_type
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ?`
  ).all(thesisId);
  const docScores = evaluations.filter(e => e.evaluation_type !== 'presentation' && e.final_score != null).map(e => Number(e.final_score));
  const presScores = evaluations.filter(e => e.evaluation_type === 'presentation' && e.final_score != null).map(e => Number(e.final_score));
  const docAvg = docScores.length ? (docScores.reduce((a,b)=>a+b,0) / docScores.length) : 0;
  const presAvg = presScores.length ? (presScores.reduce((a,b)=>a+b,0) / presScores.length) : 0;
  const finalScore = thesis && thesis.defense_date
    ? (docAvg * (docWeight / 100)) + (presAvg * (presWeight / 100))
    : docAvg;
  return { finalScore, docAvg, presAvg, docWeight, presWeight };
}

// Función para replicar la tabla de firmas para múltiples pares
function replicateSignatureTable(documentXml, pairs) {
  // Si solo hay 1 par o menos, no es necesario replicar
  if (pairs.length <= 1) {
    return documentXml;
  }
  
  try {
    // Encontrar la tabla de firmas (contiene {persona1_nombre}, {persona2_nombre})
    // Ignorar la tabla del programa (que es la última)
    const tablePattern = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    let tables = [];
    let match;
    while ((match = tablePattern.exec(documentXml)) !== null) {
      tables.push({ start: match.index, end: match.index + match[0].length, content: match[0] });
    }
    
    if (tables.length === 0) {
      console.warn('⚠️  No tables found in document');
      return documentXml;
    }
    
    // Encontrar la tabla de firmas (penúltima si hay tabla de programa al final)
    // La tabla de firmas tiene los placeholders {persona1_nombre} y {persona2_nombre}
    let firsSignatoryTableIndex = -1;
    for (let i = tables.length - 1; i >= 0; i--) {
      if (tables[i].content.includes('{persona1_nombre}') || tables[i].content.includes('persona1_nombre')) {
        firsSignatoryTableIndex = i;
        break;
      }
    }
    
    if (firsSignatoryTableIndex === -1) {
      console.warn('⚠️  Signature table not found');
      return documentXml;
    }
    
    const sourceTable = tables[firsSignatoryTableIndex];
    let beforeTable = documentXml.substring(0, sourceTable.end);
    let afterTable = documentXml.substring(sourceTable.end);
    
    // Para cada par adicional (ignorar el primero que ya está en el template)
    for (let pairIndex = 1; pairIndex < pairs.length; pairIndex++) {
      const pair = pairs[pairIndex];
      
      // Clonar la tabla
      let newTable = sourceTable.content;
      
      const persona1Nombre = pair.persona1?.signer_name || '';
      const persona2Nombre = pair.persona2?.signer_name || '';
      const rol1 = pair.persona1?.signer_role === 'director' ? 'Director(a) del Proyecto' : 'Jurado Evaluador(a)';
      const rol2 = pair.persona2?.signer_role === 'director' ? 'Director(a) del Proyecto' : 'Jurado Evaluador(a)';
      const firma1 = pair.persona1 ? `[Firma registrada: ${pair.persona1.signer_name}]` : '';
      const firma2 = pair.persona2 ? `[Firma registrada: ${pair.persona2.signer_name}]` : '';
      
      // Reemplazar placeholders con datos del nuevo par
      newTable = newTable.replace(/{persona1_nombre}/g, persona1Nombre);
      newTable = newTable.replace(/{persona2_nombre}/g, persona2Nombre);
      newTable = newTable.replace(/{persona1_rol}/g, rol1);
      newTable = newTable.replace(/{persona2_rol}/g, rol2 || '');
      
      // Reemplazar placeholders para firmas
      newTable = newTable.replace(/{firma1}/g, firma1);
      newTable = newTable.replace(/{firma2}/g, firma2);
      
      console.log(`  ✓ Tabla ${pairIndex}: ${persona1Nombre} + ${persona2Nombre}`);
      
      // Insertar la nueva tabla después de la anterior
      beforeTable += newTable;
    }
    
    return beforeTable + afterTable;
  } catch (error) {
    console.error('Error replicando tabla de firmas:', error);
    return documentXml;
  }
}

// Función para corregir mc:Ignorable con prefijos no declarados (artefacto de python-docx)
function fixMcIgnorable(documentXml) {
  const rootMatch = documentXml.match(/<w:document([^>]*)>/);
  if (!rootMatch) return documentXml;
  const rootAttrs = rootMatch[1];

  // Construir mapa URI → prefijo declarado
  const uriToPrefix = {};
  const nsRegex = /xmlns:(\w+)="([^"]*)"/g;
  let m;
  while ((m = nsRegex.exec(rootAttrs)) !== null) {
    uriToPrefix[m[2]] = m[1];
  }

  // Mapa de prefijos estándar de Word → URI
  const stdPrefixToUri = {
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'w16se': 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
    'w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
    'w16': 'http://schemas.microsoft.com/office/word/2018/wordml',
    'w16cex': 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
    'w16sdtdh': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
    'w16sdtfl': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdataformatting',
    'w16du': 'http://schemas.microsoft.com/office/word/2023/wordml/word16du',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  };

  // Buscar el atributo mc:Ignorable (puede ser ns1:Ignorable, etc.)
  const ignMatch = rootAttrs.match(/(\w+:Ignorable)="([^"]*)"/);
  if (!ignMatch) return documentXml;

  const ignAttrName = ignMatch[1];
  const oldPrefixes = ignMatch[2].split(/\s+/).filter(Boolean);

  // Reemplazar cada prefijo por el correcto (el declarado en este documento) o añadir declaración
  let newRootAttrs = rootAttrs;
  const newPrefixes = [];
  let modified = false;

  for (const oldP of oldPrefixes) {
    // Si el prefijo ya está declarado, mantenerlo tal cual
    if (newRootAttrs.includes(`xmlns:${oldP}="`)) {
      newPrefixes.push(oldP);
      continue;
    }
    // Buscar si la URI de este prefijo estándar ya tiene otro prefijo declarado
    const uri = stdPrefixToUri[oldP];
    if (uri && uriToPrefix[uri]) {
      // Usar el prefijo existente en lugar del estándar
      newPrefixes.push(uriToPrefix[uri]);
      modified = true;
    } else if (uri) {
      // La URI no está declarada; añadir la declaración con el prefijo estándar
      newRootAttrs += ` xmlns:${oldP}="${uri}"`;
      newPrefixes.push(oldP);
      modified = true;
    }
    // Si no conocemos la URI, simplemente omitimos el prefijo
  }

  if (modified) {
    const newIgnorable = `${ignAttrName}="${newPrefixes.join(' ')}"`;
    newRootAttrs = newRootAttrs.replace(/\w+:Ignorable="[^"]*"/, newIgnorable);
    documentXml = documentXml.replace(/<w:document[^>]*>/, `<w:document${newRootAttrs}>`);
    console.log('  ✓ mc:Ignorable corregido:', newPrefixes.join(' '));
  }

  return documentXml;
}

// Función para insertar imágenes de firma en el documento DOCX
function insertSignatureImages(zip, signatures) {
  try {
    // Leer el document.xml
    let documentXml = zip.file('word/document.xml').asText();

    // Corregir mc:Ignorable con prefijos no declarados
    documentXml = fixMcIgnorable(documentXml);

    // Construir mapa URI → prefijo existente en el documento
    const rootMatch = documentXml.match(/<w:document([^>]*)>/);
    const uriToPrefix = {};
    if (rootMatch) {
      const nsRegex = /xmlns:(\w+)="([^"]*)"/g;
      let m;
      while ((m = nsRegex.exec(rootMatch[1])) !== null) {
        uriToPrefix[m[2]] = m[1];
      }
    }

    // Determinar los prefijos correctos para drawing XML
    const wpPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'] || 'wp';
    const aPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/main'] || 'a';
    const picPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/picture'] || 'pic';
    const rPrefix = uriToPrefix['http://schemas.openxmlformats.org/officeDocument/2006/relationships'] || 'r';

    console.log(`  Namespace prefixes: wp=${wpPrefix}, a=${aPrefix}, pic=${picPrefix}, r=${rPrefix}`);

    // Añadir declaraciones de namespace solo si faltan por completo
    const requiredNs = {
      [wpPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      [aPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/main',
      [picPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
      [rPrefix]: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    };

    if (rootMatch) {
      let rootAttributes = documentXml.match(/<w:document([^>]*)>/)[1];
      let nsModified = false;
      for (const [prefix, uri] of Object.entries(requiredNs)) {
        if (!rootAttributes.includes(`xmlns:${prefix}="`)) {
          rootAttributes += ` xmlns:${prefix}="${uri}"`;
          nsModified = true;
        }
      }
      if (nsModified) {
        documentXml = documentXml.replace(/<w:document[^>]*>/, `<w:document${rootAttributes}>`);
      }
    }
    
    // Leer o crear el archivo de relaciones
    let relsXml;
    try {
      relsXml = zip.file('word/_rels/document.xml.rels').asText();
    } catch {
      relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    }
    
    // Encontrar el próximo ID de relación disponible
    const relIdMatches = relsXml.match(/Id="rId(\d+)"/g) || [];
    let maxRelId = 0;
    relIdMatches.forEach(match => {
      const id = parseInt(match.match(/\d+/)[0]);
      if (id > maxRelId) maxRelId = id;
    });
    
    let nextRelId = maxRelId + 1;
    let imageCounter = 1;
    
    // Procesar cada firma usando nombres específicos
    signatures.forEach((sig, idx) => {
      if (!sig || !sig.file_url) return;
      
      console.log(`  ⏳ Procesando firma ${idx + 1}/${signatures.length}: ${sig.signer_name}`);
      
      const imagePath = path.join(uploadDir, path.basename(sig.file_url));
      if (!fs.existsSync(imagePath)) {
        console.log(`    ❌ Archivo no encontrado: ${imagePath}`);
        return;
      }
      
      // Leer la imagen
      const imageData = fs.readFileSync(imagePath);
      const imageExt = path.extname(imagePath).slice(1) || 'png';
      
      // Obtener dimensiones de la imagen
      let dimensions;
      try {
        dimensions = imageSize(imageData);
      } catch (err) {
        console.log(`    ⚠️  No se pudo determinar tamaño: ${err.message}`);
        dimensions = { width: 200, height: 100 };
      }
      
      // Calcular dimensiones para el documento (ancho máximo 5cm = ~1800000 EMUs)
      const maxWidth = 1800000; // EMUs (English Metric Units)
      const ratio = dimensions.width / dimensions.height;
      const width = Math.min(maxWidth, dimensions.width * 9525); // convertir px a EMUs
      const height = width / ratio;
      
      const imageFilename = `firma_signature_${idx+1}.${imageExt}`;
      const relId = `rId${nextRelId}`;
      
      // Añadir la imagen al zip
      zip.file(`word/media/${imageFilename}`, imageData);
      
      // Crear el XML de la imagen usando los prefijos correctos del documento
      const docPrId = 1000 + idx; // ID único para evitar conflictos
      const w = Math.round(width);
      const h = Math.round(height);
      const drawingXml = `<w:r><w:drawing><${wpPrefix}:inline distT="0" distB="0" distL="0" distR="0"><${wpPrefix}:extent cx="${w}" cy="${h}"/><${wpPrefix}:effectExtent l="0" t="0" r="0" b="0"/><${wpPrefix}:docPr id="${docPrId}" name="${imageFilename}"/><${wpPrefix}:cNvGraphicFramePr><${aPrefix}:graphicFrameLocks noChangeAspect="1"/></${wpPrefix}:cNvGraphicFramePr><${aPrefix}:graphic><${aPrefix}:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><${picPrefix}:pic><${picPrefix}:nvPicPr><${picPrefix}:cNvPr id="${docPrId}" name="${imageFilename}"/><${picPrefix}:cNvPicPr/></${picPrefix}:nvPicPr><${picPrefix}:blipFill><${aPrefix}:blip ${rPrefix}:embed="${relId}"/><${aPrefix}:stretch><${aPrefix}:fillRect/></${aPrefix}:stretch></${picPrefix}:blipFill><${picPrefix}:spPr><${aPrefix}:xfrm><${aPrefix}:off x="0" y="0"/><${aPrefix}:ext cx="${w}" cy="${h}"/></${aPrefix}:xfrm><${aPrefix}:prstGeom prst="rect"><${aPrefix}:avLst/></${aPrefix}:prstGeom></${picPrefix}:spPr></${picPrefix}:pic></${aPrefix}:graphicData></${aPrefix}:graphic></${wpPrefix}:inline></w:drawing></w:r>`;
      
      // Buscar y reemplazar TODAS las ocurrencias del placeholder en el XML (case-insensitive)
      const escapedName = sig.signer_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholderToFind = `[Firma registrada: ${sig.signer_name}]`;
      console.log(`    🔍 Buscando placeholder: "${placeholderToFind}"`);
      
      const runWithPlaceholder = new RegExp(
        `(<w:r[^>]*>.*?)<w:t[^>]*>\\[Firma registrada: ${escapedName}\\]</w:t>(.*?</w:r>)`,
        'gis'
      );
      
      let replacementCount = 0;
      documentXml = documentXml.replace(runWithPlaceholder, (match, before, after) => {
        replacementCount++;
        return `${before}<w:t></w:t>${after}${drawingXml}`;
      });
      
      if (replacementCount === 0) {
        console.log(`    ⚠️  No encontró placeholder para: ${sig.signer_name}`);
        // Buscar aproximadamente para debug
        const simplePlaceholder = `Firma registrada: ${sig.signer_name}`;
        if (documentXml.includes(simplePlaceholder)) {
          console.log(`    ℹ️  Pero el texto sí aparece en el documento`);
        } else {
          console.log(`    ℹ️  El texto NO aparece en el documento`);
        }
      } else {
        console.log(`    ✓ Firma insertada (${replacementCount} ocurrencia${replacementCount > 1 ? 's' : ''})`);
      }
      
      // Añadir la relación
      const relationshipXml = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFilename}"/>`;
      relsXml = relsXml.replace('</Relationships>', `${relationshipXml}</Relationships>`);
      
      nextRelId++;
      imageCounter++;
    });
    
    // Actualizar los archivos en el zip
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    
    return zip;
  } catch (error) {
    console.error('Error insertando imágenes de firma:', error);
    return zip;
  }
}

function buildSimplePdf(lines = []) {
  const escaped = lines.map(line => String(line || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
  const content = [
    'BT',
    '/F1 11 Tf',
    '50 800 Td',
    ...escaped.flatMap((line, idx) => idx === 0 ? [`(${line}) Tj`] : ['0 -15 Td', `(${line}) Tj`]),
    'ET'
  ].join('\n');

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj + '\n';
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function getActaContext(thesisId) {
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId);
  if (!thesis) return null;
  
  // Obtener nombres de programas asociados a la tesis
  const programs = db.prepare(
    `SELECT p.name FROM programs p
     JOIN thesis_programs tp ON p.id = tp.program_id
     WHERE tp.thesis_id = ?`
  ).all(thesisId);
  const programName = programs.map(p => p.name).join(', ') || '';
  
  const students = db.prepare(
    `SELECT u.full_name as name, u.student_code, u.cedula
     FROM users u
     JOIN thesis_students ts ON ts.student_id = u.id
     WHERE ts.thesis_id = ?`
  ).all(thesisId);
  const evaluators = db.prepare(
    `SELECT u.id, u.full_name as name
     FROM users u
     JOIN thesis_evaluators te ON te.evaluator_id = u.id
     WHERE te.thesis_id = ?`
  ).all(thesisId);
  const directors = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesisId).map(r => r.name);
  const signatures = db.prepare('SELECT * FROM acta_signatures WHERE thesis_id = ? ORDER BY created_at ASC').all(thesisId)
    .map(s => ({ ...s, file_url: `/uploads/${path.basename(s.file_url)}` }));
  const weighted = computeFinalWeightedForThesis(thesisId);
  return { thesis, students, evaluators, directors, signatures, weighted, programName };
}

function hasEvaluatorCompletedRequired(thesisId, evaluatorId) {
  const thesis = db.prepare('SELECT defense_date FROM theses WHERE id = ?').get(thesisId);
  const evals = db.prepare(
    `SELECT e.evaluation_type
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ? AND te.evaluator_id = ?`
  ).all(thesisId, evaluatorId);
  const hasDoc = evals.some(e => e.evaluation_type !== 'presentation');
  const hasPres = evals.some(e => e.evaluation_type === 'presentation');
  return hasDoc && (!thesis?.defense_date || hasPres);
}

// Subida de archivos y registro de directores para tesis
app.post('/theses/:id/files', authMiddleware, upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'endorsement', maxCount: 1 }
]), (req, res) => {
  const thesis_id = req.params.id;
  const { directors, project_name, abstract, url } = req.body;
  // Validar que el usuario sea estudiante de la tesis
  const isStudent = db.prepare('SELECT 1 FROM thesis_students WHERE thesis_id = ? AND student_id = ?').get(thesis_id, req.user.id);
  if (!isStudent) return res.status(403).json({ error: 'forbidden' });

  // Actualizar nombre y resumen del proyecto si se envían
  if (project_name || abstract) {
    db.prepare('UPDATE theses SET title = ?, abstract = ? WHERE id = ?')
      .run(project_name || '', abstract || '', thesis_id);
  }

  // Guardar archivos subidos
  const files = req.files || {};
  const savedFiles = [];
  for (const field of ['document', 'endorsement']) {
    if (files[field] && files[field][0]) {
      const f = files[field][0];
      const id = uuidv4();
      // store only basename so we can serve via /uploads/:file
      const basename = path.basename(f.path);
      db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, thesis_id, f.originalname, field, basename, req.user.id);
      savedFiles.push({ id, file_name: f.originalname, file_type: field, file_path: basename });
    }
  }
  // Guardar URL si se envía
  if (url) {
    const id = uuidv4();
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, thesis_id, url, 'url', url, req.user.id);
    savedFiles.push({ id, file_name: url, file_type: 'url', file_path: url });
  }

  // Guardar directores (pueden ser varios, separados por coma o array)
  if (directors) {
    // primero eliminar los existentes para que las ediciones no acumulen vencidos
    db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(thesis_id);
    let directorList = directors;
    if (typeof directors === 'string') {
      try { directorList = JSON.parse(directors); } catch { directorList = directors.split(',').map(s => s.trim()); }
    }
    for (const name of directorList) {
      if (name && name.length > 1) {
        db.prepare('INSERT INTO thesis_directors (id, thesis_id, name) VALUES (?, ?, ?)')
          .run(uuidv4(), thesis_id, name);
      }
    }
  }
  res.json({ ok: true, files: savedFiles });
});

// Endpoint para estadísticas del panel de administración
app.get('/admin/stats', authMiddleware, requireRole('admin'), (req, res) => {
  const totalTheses = db.prepare("SELECT COUNT(*) as count FROM theses WHERE status != 'deleted'").get().count;
  const inEvaluation = db.prepare("SELECT COUNT(*) as count FROM theses WHERE status IN ('submitted','revision_minima','revision_cuidados')").get().count;
  const finalized = db.prepare("SELECT COUNT(*) as count FROM theses WHERE status = 'sustentacion'").get().count;
  const evaluators = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM user_roles WHERE role = 'evaluator'").get().count;
  res.json({
    totalTheses,
    inEvaluation,
    finalized,
    evaluators
  });
});
// Agregar evento al timeline de tesis (admin o evaluador)
app.post('/theses/:id/timeline', authMiddleware, (req, res) => {
  const { event_type, description, completed } = req.body;
  const thesis_id = req.params.id;
  const id = uuidv4();
  const created_at = Math.floor(Date.now() / 1000);
  // Solo admin o evaluador puede agregar eventos
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  if (!roles.includes('admin') && !roles.includes('evaluator')) return res.status(403).json({ error: 'forbidden' });
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, thesis_id, event_type, description || '', completed ? 1 : 0, created_at);
  res.json({ ok: true });
});

// admin feedback endpoint with optional file uploads
app.post('/theses/:id/feedback', authMiddleware, requireRole('admin'), upload.single('file'), (req, res) => {
  const thesis_id = req.params.id;
  const { comment } = req.body;
  const created_at = Date.now();
  const id = uuidv4();
  // add timeline event for feedback
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, thesis_id, 'admin_feedback', comment || 'Feedback del admin', 0, created_at);
  // store file if present
  if (req.file) {
    const basename = path.basename(req.file.path);
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, req.file.originalname, 'admin_feedback', basename, req.user.id);
  }
  res.json({ ok: true });
});

// admin decision (approve to sustentacion or reject)
app.post('/theses/:id/decision', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { action, comment } = req.body;
  const now = Date.now();
  if (action === 'sustentacion') {
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('sustentacion', thesis_id);
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'admin_decision', 'Aprobada para sustentación' + (comment ? `: ${comment}` : ''), 1, now);
    return res.json({ ok: true });
  }
  if (action === 'reject') {
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('draft', thesis_id);
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'admin_decision', 'Rechazada por admin' + (comment ? `: ${comment}` : ''), 1, now);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'action must be sustentacion or reject' });
});

// Asignar evaluador a tesis (solo admin) - individual, kept for backward compatibility
app.post('/theses/:id/assign-evaluator', authMiddleware, requireRole('admin'), (req, res) => {
  const { evaluator_id, is_blind, due_date } = req.body;
  const thesis_id = req.params.id;
  const id = uuidv4();
  db.prepare('INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, due_date, is_blind) VALUES (?, ?, ?, ?, ?)')
    .run(id, thesis_id, evaluator_id, due_date || null, is_blind ? 1 : 0);
  // update status when at least one evaluator assigned; may be called twice
  db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('evaluators_assigned', thesis_id);
  // build a descriptive timeline entry
  let desc;
  if (is_blind) {
    desc = 'Evaluador asignado (par ciego)';
  } else {
    const row = db.prepare('SELECT full_name FROM users WHERE id = ?').get(evaluator_id);
    desc = `Evaluador asignado${row && row.full_name ? `: ${row.full_name}` : ''}`;
  }
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'evaluators_assigned', desc, 1, Date.now());
  res.json({ ok: true });
});

// Asignar múltiples evaluadores en un solo paso (solo admin)
app.post('/theses/:id/assign-evaluators', authMiddleware, requireRole('admin'), (req, res) => {
  const { evaluator_ids, is_blind, due_date } = req.body;
  const thesis_id = req.params.id;
  if (!Array.isArray(evaluator_ids) || evaluator_ids.length === 0) {
    return res.status(400).json({ error: 'evaluator_ids array required' });
  }
  const tx = db.transaction(() => {
    for (const ev of evaluator_ids) {
      const id = uuidv4();
      db.prepare('INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, due_date, is_blind) VALUES (?, ?, ?, ?, ?)')
        .run(id, thesis_id, ev, due_date || null, is_blind ? 1 : 0);
    }
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('evaluators_assigned', thesis_id);
    // build a description string that includes evaluator names when not blind
    let desc;
    if (is_blind) {
      desc = `Evaluadores asignados (${evaluator_ids.length}) (pares ciegos)`;
    } else {
      const placeholders = evaluator_ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT full_name FROM users WHERE id IN (${placeholders})`).all(...evaluator_ids);
      const names = rows.map(r => r.full_name).filter(Boolean);
      desc = `Evaluadores asignados (${evaluator_ids.length})${names.length ? `: ${names.join(', ')}` : ''}`;
    }
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'evaluators_assigned', desc, 1, Date.now());
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reply to thesis (admin reviews checklist, may send back to student)
app.post('/theses/:id/reply', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { ok, comment } = req.body;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const now = Date.now();
  if (ok) {
    // nothing special, status should be 'submitted' or onward
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'review_ok', comment || 'Revisión positiva', 1, now);
  } else {
    // revert to draft so student can fix
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('draft', thesis_id);
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'review_fail', comment || 'Revisión negativa', 1, now);
  }
  res.json({ ok: true });
});

// Student submits a revision/response to evaluator comments (files + comment)
app.post('/theses/:id/revision', authMiddleware, upload.array('files'), (req, res) => {
  const thesis_id = req.params.id;
  // ensure the user is a student on this thesis
  const isStudent = db.prepare('SELECT 1 FROM thesis_students WHERE thesis_id = ? AND student_id = ?').get(thesis_id, req.user.id);
  if (!isStudent) return res.status(403).json({ error: 'forbidden' });

  const { comment } = req.body;
  const now = Date.now();

  // insert timeline event so evaluators and students see the revision
  // generate event id so uploaded files can reference it
  const eventId = uuidv4();
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(eventId, thesis_id, 'revision_submitted', comment || 'Revisión enviada por estudiante', 1, now);
  // save uploaded files as thesis_files of type 'revision', link to the timeline event
  const files = req.files || [];
  for (const f of files) {
    const id = uuidv4();
    const basename = path.basename(f.path);
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by, timeline_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, thesis_id, f.originalname, 'revision', basename, req.user.id, eventId);
  }

  // update thesis status to 'submitted' and bump revision round so evaluators can re-evaluate
  try {
    db.prepare('UPDATE theses SET status = ?, revision_round = revision_round + 1 WHERE id = ?').run('submitted', thesis_id);
  } catch (err) {
    console.error('Error updating thesis status on revision submit', err);
  }

  res.json({ ok: true });
});

// Asignar estudiante a tesis (solo admin)
app.post('/theses/:id/assign-student', authMiddleware, requireRole('admin'), (req, res) => {
  const { student_id } = req.body;
  const thesis_id = req.params.id;
  const id = uuidv4();
  db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
    .run(id, thesis_id, student_id);
  res.json({ ok: true });
});

// Actualizar tesis (solo admin o creador mientras esté en borrador)
app.put('/theses/:id', authMiddleware, async (req, res) => {
  const { title, abstract, status, companion, program_ids, keywords } = req.body;
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  if (thesis.created_by !== req.user.id && !roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // si no es admin, sólo puede editar si está en borrador
  if (!roles.includes('admin') && thesis.status !== 'draft') {
    return res.status(400).json({ error: 'cannot modify after submission' });
  }

  db.prepare('UPDATE theses SET title = ?, abstract = ?, keywords = ?, status = ? WHERE id = ?')
    .run(title || thesis.title, abstract || thesis.abstract, keywords !== undefined ? keywords : thesis.keywords, status || thesis.status, thesis_id);

  // companion logic: either update existing or create new when provided
  if (companion) {
    if (!companion.full_name || !companion.student_code || !companion.cedula) {
      return res.status(400).json({ error: 'companion requires full_name, student_code and cedula' });
    }
    // find current companion (student distinto del propio creador)
    const existingComp = db.prepare(
      `SELECT u.id FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ? AND u.id != ?`
    ).get(thesis_id, req.user.id);
    // ensure no other user has the same code or cedula
    let dup;
    if (existingComp) {
      dup = db.prepare('SELECT id FROM users WHERE (student_code = ? OR cedula = ?) AND id != ?')
        .get(companion.student_code, companion.cedula, existingComp.id);
    } else {
      dup = db.prepare('SELECT id FROM users WHERE student_code = ? OR cedula = ?')
        .get(companion.student_code, companion.cedula);
    }
    if (dup) {
      return res.status(400).json({ error: 'companion student_code or cedula already used' });
    }

    try {
      if (existingComp) {
        // update the partner's user record
        let params = [companion.full_name, companion.student_code, companion.cedula || null];
        let sql = 'UPDATE users SET full_name = ?, student_code = ?, cedula = ?';
        // update email too in case code changed
        sql += ', email = ?';
        params.push(companion.student_code + '@estudiante.local');
        if (companion.password) {
          const hash = await bcrypt.hash(companion.password, 10);
          sql += ', password_hash = ?';
          params.push(hash);
        }
        sql += ' WHERE id = ?';
        params.push(existingComp.id);
        db.prepare(sql).run(...params);
      } else {
        // create and associate a new companion just like in POST
        const compId = uuidv4();
        const hash = await bcrypt.hash(companion.password || Math.random().toString(36).slice(-8), 10);
        db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(compId,
               companion.student_code + '@estudiante.local',
               hash,
               companion.full_name,
               companion.student_code,
               companion.cedula || null,
               null);
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), compId, 'student');
        db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
          .run(uuidv4(), thesis_id, compId);
      }
    } catch (err) {
      // trap unique constraint violations
      if (String(err).includes('UNIQUE')) {
        return res.status(400).json({ error: 'companion student_code or cedula already used' });
      }
      throw err;
    }
  }

  // programs handling
  if (program_ids) {
    // clear existing
    db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(thesis_id);
    if (Array.isArray(program_ids)) {
      for (const pid of program_ids) {
        db.prepare('INSERT INTO thesis_programs (id, thesis_id, program_id) VALUES (?, ?, ?)')
          .run(uuidv4(), thesis_id, pid);
      }
    }
  }

  res.json({ ok: true });
});

// helper for pretend email (logs)
function sendEmail(to, subject, body) {
  console.log(`[email] to=${to} subject=${subject} body=${body}`);
}

// Enviar tesis a evaluación (solo autor en borrador)
// helper stub for notification (console log)
function sendEmail(to, subject, body) {
  console.log(`[email] to=${to} subject=${subject} body=${body}`);
}

app.put('/theses/:id/submit', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  if (thesis.created_by !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (thesis.status !== 'draft') return res.status(400).json({ error: 'already submitted' });
  const now = Date.now();
  db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('submitted', thesis_id);
  // notify program-specific admins
  const admins = db.prepare(`
    SELECT u.institutional_email FROM programs p
    JOIN program_admins pa ON pa.program_id = p.id
    JOIN users u ON u.id = pa.user_id
    JOIN thesis_programs tp ON tp.program_id = p.id
    WHERE tp.thesis_id = ? AND u.institutional_email IS NOT NULL
  `).all(thesis_id).map(r => r.institutional_email);
  for (const email of admins) {
    sendEmail(email, 'Nueva tesis enviada', `Se ha enviado una tesis al programa correspondiente (id: ${thesis_id})`);
  }
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'submitted', 'Tesis enviada a evaluación', 1, now);
  res.json({ ok: true });
});

// Eliminar tesis (admin o autor en borrador)
app.delete('/theses/:id', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  console.log('delete attempt by', req.user && req.user.id, 'thesis', thesis);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  console.log('roles for user', roles);
  if (roles.includes('admin') || (thesis.created_by === req.user.id && thesis.status === 'draft')) {
    // if an admin and there are already evaluations, perform soft delete
    const evCount = db.prepare(
      `SELECT COUNT(*) as c FROM evaluations e
       JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
       WHERE te.thesis_id = ?`
    ).get(thesis_id).c;
    if (evCount > 0 && roles.includes('admin')) {
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('deleted', thesis_id);
      return res.json({ ok: true, soft: true });
    }
    // temporalmente desactivar comprobación de claves foráneas
    db.pragma('foreign_keys = OFF');
    try {
      // limpiar tablas relacionadas para evitar violaciones de FK
      let r;
    r = db.prepare('DELETE FROM thesis_files WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_files', r.changes);
    r = db.prepare('DELETE FROM thesis_timeline WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_timeline', r.changes);
    r = db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_directors', r.changes);
    r = db.prepare('DELETE FROM thesis_students WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_students', r.changes);
    // primero borrar evaluaciones y sus archivos/puntajes, porque referencian
    // thesis_evaluators. usamos subconsultas simples con IN para evitar joins
    r = db.prepare(
      `DELETE FROM evaluation_files WHERE evaluation_id IN (
         SELECT id FROM evaluations WHERE thesis_evaluator_id IN (
            SELECT id FROM thesis_evaluators WHERE thesis_id = ?
         )
       )`
    ).run(thesis_id);
    console.log('deleted evaluation_files', r.changes);
    r = db.prepare(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (
         SELECT id FROM evaluations WHERE thesis_evaluator_id IN (
            SELECT id FROM thesis_evaluators WHERE thesis_id = ?
         )
       )`
    ).run(thesis_id);
    console.log('deleted evaluation_scores', r.changes);
    r = db.prepare(
      `DELETE FROM evaluations WHERE thesis_evaluator_id IN (
         SELECT id FROM thesis_evaluators WHERE thesis_id = ?
       )`
    ).run(thesis_id);
    console.log('deleted evaluations', r.changes);
    // luego sí eliminar asignaciones
    r = db.prepare('DELETE FROM thesis_evaluators WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_evaluators', r.changes);
    // eliminar vínculos programa
    r = db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_programs', r.changes);
    r = db.prepare('DELETE FROM theses WHERE id = ?').run(thesis_id);
    console.log('deleted thesis record', r.changes);
    return res.json({ ok: true });
  } finally {
    // restore FK enforcement
    db.pragma('foreign_keys = ON');
  }
    return res.json({ ok: true });
  }
  console.log('delete forbidden');
  res.status(403).json({ error: 'forbidden' });
});

// Listar evaluaciones por tesis
app.get('/theses/:id/evaluations', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const rows = db.prepare('SELECT * FROM evaluations WHERE thesis_id = ?').all(thesis_id);
  res.json(rows);
});

// Listar evaluaciones por evaluador
app.get('/evaluators/:id/evaluations', authMiddleware, requireRole('evaluator'), (req, res) => {
  const evaluator_id = req.params.id;
  if (evaluator_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const rows = db.prepare('SELECT * FROM evaluations WHERE evaluator_id = ?').all(evaluator_id);
  res.json(rows);
});

// Timeline de tesis (eventos)
app.get('/theses/:id/timeline', authMiddleware, (req, res) => {
  // Suponiendo que hay una tabla thesis_timeline (debería agregarse al esquema si no existe)
  const thesis_id = req.params.id;
  const rows = db.prepare('SELECT * FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC').all(thesis_id);
  res.json(rows);
});
// Registrar evaluador o staff (solo admin)
app.post('/users/register', authMiddleware, requireRole('admin'), async (req, res) => {
  const { email, password, full_name, role, specialty } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: 'email, password y role requeridos' });
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)')
      .run(id, email, password_hash, full_name || null);
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(id, role);
    // Si es evaluador, guardar especialidad
    if (role === 'evaluator' && specialty) {
      db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email) VALUES (?, ?, ?)')
        .run(id, full_name || '', email);
      db.prepare('UPDATE profiles SET specialty = ? WHERE id = ?').run(specialty, id);
    }
    const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(id);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Listar usuarios (solo admin). Puede filtrar por ?role=evaluator etc.
app.get('/users', authMiddleware, requireRole('admin'), (req, res) => {
  const { role } = req.query;
  let sql = `SELECT u.id, u.institutional_email, u.full_name, r.role
             FROM users u
             LEFT JOIN user_roles r ON u.id = r.user_id`;
  const params = [];
  if (role) {
    sql += ' WHERE r.role = ?';
    params.push(role);
  }
  const rows = db.prepare(sql).all(...params);
  // aggregate roles into array per user
  const map = {};
  for (const r of rows) {
    if (!map[r.id]) {
      map[r.id] = { id: r.id, institutional_email: r.institutional_email, full_name: r.full_name, roles: [] };
    }
    if (r.role) map[r.id].roles.push(r.role);
  }
  res.json(Object.values(map));
});

// Editar usuario (solo admin)
app.put('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { full_name, email, student_code, cedula } = req.body;
  const { id } = req.params;
  try {
    // check uniqueness if provided
    if (student_code) {
      const dup = db.prepare('SELECT id FROM users WHERE student_code = ? AND id != ?').get(student_code, id);
      if (dup) return res.status(400).json({ error: 'student_code already in use' });
    }
    if (cedula) {
      const dup = db.prepare('SELECT id FROM users WHERE cedula = ? AND id != ?').get(cedula, id);
      if (dup) return res.status(400).json({ error: 'cedula already in use' });
    }
    db.prepare('UPDATE users SET full_name = ?, email = ?, student_code = ?, cedula = ? WHERE id = ?')
      .run(full_name, email, student_code || null, cedula || null, id);
    res.json({ ok: true });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) {
      return res.status(400).json({ error: 'email, student_code or cedula already used' });
    }
    res.status(500).json({ error: msg });
  }
});

// Eliminar usuario (solo admin). limpiamos datos asociados para evitar violaciones de fk
app.delete('/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const tx = db.transaction(() => {
    // roles y enlaces con tesis
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id);
    // evaluador: quitar asignaciones y evaluaciones
    db.prepare('DELETE FROM thesis_evaluators WHERE evaluator_id = ?').run(id);
    db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (
         SELECT e.id FROM evaluations e
         JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
         WHERE te.evaluator_id = ?
       )`).run(id);
    db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (
         SELECT e.id FROM evaluations e
         JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
         WHERE te.evaluator_id = ?
       )`).run(id);
    db.prepare(`DELETE FROM evaluations WHERE thesis_evaluator_id IN (
         SELECT id FROM thesis_evaluators WHERE evaluator_id = ?
       )`).run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Cambiar contraseña (usuario autenticado)
app.post('/auth/change-password', authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'old_password y new_password requeridos' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const ok = await bcrypt.compare(old_password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const password_hash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
// ...existing code...

function signToken(user) {
  // include institutional_email for clarity
  return jwt.sign({ id: user.id, institutional_email: user.institutional_email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const rows = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id);
    const roles = rows.map(r => r.role);
    // superadmin bypasses any role requirement
    if (!roles.includes(role) && !roles.includes('superadmin')) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

app.post('/auth/register', async (req, res) => {
  // students register using their institucional email; we also store it in email column
  const { institutional_email, password, full_name, student_code, cedula } = req.body;
  if (!institutional_email || !password) return res.status(400).json({ error: 'institutional_email and password required' });
  // uniqueness checks
  const existsMail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsMail) return res.status(400).json({ error: 'institutional_email already in use' });
  if (student_code) {
    const exists = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (exists) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula) {
    const exists = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (exists) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, student_code || null, cedula || null, institutional_email || null);

    // assign student role by default
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(id, 'student');

    const user = db.prepare('SELECT id, email, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(id);
    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE') && msg.includes('users')) {
      return res.status(400).json({ error: 'institutional_email, student_code or cedula already used' });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/auth/login', async (req, res) => {
  // allow login by institucional email, student_code or cedula
  let { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password required' });
  try {
    let user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE institutional_email = ?').get(identifier);
    if (!user && typeof identifier === 'string' && !identifier.includes('@')) {
      // try student_code
      user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE student_code = ?').get(identifier);
    }
    if (!user && typeof identifier === 'string' && !identifier.includes('@')) {
      // try cedula
      user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE cedula = ?').get(identifier);
    }
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    delete user.password_hash;
    // hide generic email field, rely on institutional_email instead
    delete user.email;
    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/auth/logout', (req, res) => {
  // With JWT we rely on client to discard token; implement blacklist if needed
  res.json({ ok: true });
});

app.get('/auth/session', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return res.json({ session: null });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.json({ session: null });
    return res.json({ session: { user } });
  } catch (err) {
    return res.json({ session: null });
  }
});

app.get('/profiles/:id', (req, res) => {
  const id = req.params.id;
  const profile = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(id);
  if (!profile) return res.status(404).json({ error: 'not found' });
  res.json(profile);
});

app.get('/user_roles', (req, res) => {
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const rows = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(user_id);
  res.json(rows.map(r => r.role));
});

// Programs API (categorías creadas por admin)
app.get('/programs', authMiddleware, (req, res) => {
  // return program info along with list of admin user ids (and optional emails)
  const rows = db.prepare(
    `SELECT p.id, p.name,
            GROUP_CONCAT(pa.user_id) as admin_user_ids
     FROM programs p
     LEFT JOIN program_admins pa ON pa.program_id = p.id
     GROUP BY p.id, p.name
     ORDER BY p.name`
  ).all();
  // convert comma-separated string to array
  const data = rows.map(r => ({
    id: r.id,
    name: r.name,
    admin_user_ids: r.admin_user_ids ? r.admin_user_ids.split(',') : []
  }));
  res.json(data);
});

app.post('/programs', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, admin_user_id, admin_user_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  try {
    // keep legacy column but we will also populate program_admins
    db.prepare('INSERT INTO programs (id, name, admin_user_id) VALUES (?, ?, ?)').run(id, name, admin_user_id || null);
    const usedIds = Array.isArray(admin_user_ids) ? admin_user_ids : (admin_user_id ? [admin_user_id] : []);
    for (const uid of usedIds) {
      db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
        .run(uuidv4(), id, uid);
    }
    res.json({ id, name, admin_user_ids: usedIds });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// editar un programa existente
app.put('/programs/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const { name, admin_user_id, admin_user_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const existing = db.prepare('SELECT id FROM programs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    db.prepare('UPDATE programs SET name = ?, admin_user_id = ? WHERE id = ?').run(name, admin_user_id || null, id);
    // update join table if list provided
    if (admin_user_ids) {
      db.prepare('DELETE FROM program_admins WHERE program_id = ?').run(id);
      for (const uid of admin_user_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), id, uid);
      }
    }
    const usedIds = Array.isArray(admin_user_ids) ? admin_user_ids : (admin_user_id ? [admin_user_id] : []);
    res.json({ id, name, admin_user_ids: usedIds });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// eliminar un programa y sus relaciones
app.delete('/programs/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM thesis_programs WHERE program_id = ?').run(id);
    db.prepare('DELETE FROM program_admins WHERE program_id = ?').run(id);
    db.prepare('DELETE FROM programs WHERE id = ?').run(id);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Superadmin-only user management
app.get('/super/users', authMiddleware, requireRole('superadmin'), (req, res) => {
  const rows = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users').all();
  const users = rows.map(u => {
    const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(u.id).map(r => r.role);
    const programs = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(u.id).map(r => r.program_id);
    return { ...u, roles, program_ids: programs };
  });
  res.json(users);
});

// Superadmin review checklist configuration
// both admins and superadmins can read the checklist template
app.get('/super/review-items', authMiddleware, (req, res) => {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const items = db.prepare('SELECT id, label, sort_order FROM review_items ORDER BY sort_order').all();
  res.json(items);
});

// weights configuration for document vs presentation
app.get('/super/weights', authMiddleware, (req, res) => {
  // allow admin, superadmin and evaluators to read weights
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!roles.includes('admin') && !roles.includes('superadmin') && !roles.includes('evaluator')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?,?)').all('doc_weight','presentation_weight');
  const result = { doc: 70, presentation: 30 };
  rows.forEach(r => {
    if (r.key === 'doc_weight') result.doc = Number(r.value);
    if (r.key === 'presentation_weight') result.presentation = Number(r.value);
  });
  res.json(result);
});
app.post('/super/weights', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { doc, presentation } = req.body;
  if (doc == null || presentation == null) return res.status(400).json({ error: 'missing weights' });
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('doc_weight', String(doc));
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('presentation_weight', String(presentation));
  res.json({ doc, presentation });
});
app.post('/super/review-items', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { label, sort_order } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const id = uuidv4();
  db.prepare('INSERT INTO review_items (id, label, sort_order) VALUES (?, ?, ?)').run(id, label, sort_order || 0);
  res.json({ id, label, sort_order: sort_order||0 });
});
app.put('/super/review-items/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { id } = req.params;
  const { label, sort_order } = req.body;
  const updates = [];
  const params = [];
  if (label !== undefined) { updates.push('label = ?'); params.push(label); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });
  params.push(id);
  db.prepare(`UPDATE review_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const item = db.prepare('SELECT id, label, sort_order FROM review_items WHERE id = ?').get(id);
  res.json(item);
});
app.delete('/super/review-items/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM review_items WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/super/users', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { institutional_email, password, full_name, student_code, cedula, roles, program_ids } = req.body;
  if (!institutional_email || !password) return res.status(400).json({ error: 'institutional_email and password required' });
  // uniqueness checks
  const existsEmail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsEmail) return res.status(400).json({ error: 'institutional_email already in use' });
  if (student_code) {
    const exists = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (exists) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula) {
    const exists = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (exists) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, student_code || null, cedula || null, institutional_email || null);
    if (roles && Array.isArray(roles)) {
      for (const r of roles) {
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, r);
      }
    }
    // if the user is an admin and programs were provided, link them
    if (roles && Array.isArray(roles) && roles.includes('admin') && Array.isArray(program_ids)) {
      for (const pid of program_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), pid, id);
      }
    }

    res.json({ id, institutional_email, full_name, student_code, cedula, institutional_email, roles: roles || [], program_ids: program_ids || [] });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) return res.status(400).json({ error: 'duplicate value' });
    res.status(500).json({ error: msg });
  }
});

// Admins (not necessarily super) may create evaluators
app.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { institutional_email, password, full_name, specialty } = req.body;
  if (!institutional_email || !password) return res.status(400).json({ error: 'institutional_email and password required' });
  const existsEmail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsEmail) return res.status(400).json({ error: 'institutional_email already in use' });
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, institutional_email) VALUES (?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, institutional_email);
    // assign evaluator role
    db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, 'evaluator');
    res.json({ id, institutional_email, full_name, specialty, roles: ['evaluator'] });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) return res.status(400).json({ error: 'duplicate value' });
    res.status(500).json({ error: msg });
  }
});

app.put('/super/users/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const uid = req.params.id;
  const { institutional_email, password, full_name, student_code, cedula, roles, program_ids } = req.body;
  // ensure user exists
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  // uniqueness checks (exclude self)
  if (institutional_email && institutional_email !== existing.institutional_email) {
    const e = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
    if (e) return res.status(400).json({ error: 'institutional_email already in use' });
  }
  if (student_code && student_code !== existing.student_code) {
    const e = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (e) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula && cedula !== existing.cedula) {
    const e = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (e) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const updates = [];
    const params = [];
    if (full_name) { updates.push('full_name = ?'); params.push(full_name); }
    if (student_code !== undefined) { updates.push('student_code = ?'); params.push(student_code || null); }
    if (cedula !== undefined) { updates.push('cedula = ?'); params.push(cedula || null); }
    if (institutional_email !== undefined) { updates.push('institutional_email = ?'); params.push(institutional_email || null); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?'); params.push(hash);
    }
    // also update email column to match
    if (institutional_email !== undefined) { updates.push('email = ?'); params.push(institutional_email || null); }
    if (updates.length) {
      params.push(uid);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    if (roles && Array.isArray(roles)) {
      // replace roles
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(uid);
      for (const r of roles) {
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), uid, r);
      }
    }
    // if the user is or becomes an admin, update program_admins links
    if (Array.isArray(program_ids)) {
      // remove existing links first
      db.prepare('DELETE FROM program_admins WHERE user_id = ?').run(uid);
      for (const pid of program_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), pid, uid);
      }
    }
    const updated = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(uid);
    const newRoles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(uid).map(r=>r.role);
    // fetch program_ids for response
    const prows = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(uid);
    const pids = prows.map(r=>r.program_id);
    res.json({ ...updated, roles: newRoles, program_ids: pids });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/super/users/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const uid = req.params.id;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM thesis_students WHERE student_id = ?').run(uid);
    db.prepare('DELETE FROM thesis_evaluators WHERE evaluator_id = ?').run(uid);
    db.prepare('DELETE FROM program_admins WHERE user_id = ?').run(uid);
    // remove theses created by this user and all associated data
    const theses = db.prepare('SELECT id FROM theses WHERE created_by = ?').all(uid);
    for (const t of theses) {
      db.prepare('DELETE FROM thesis_students WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_evaluators WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_files WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_timeline WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM theses WHERE id = ?').run(t.id);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// comprobar existencia de código o cédula (útil para validación en frontend)
// this endpoint is public so that users can verify uniqueness during registration
app.get('/users/check', (req, res) => {
  const { student_code, cedula, institutional_email } = req.query;
  const result = {};
  if (student_code) {
    const r = db.prepare('SELECT 1 FROM users WHERE student_code = ?').get(student_code);
    result.student_code = !!r;
  }
  if (cedula) {
    const r = db.prepare('SELECT 1 FROM users WHERE cedula = ?').get(cedula);
    result.cedula = !!r;
  }
  if (institutional_email) {
    const r = db.prepare('SELECT 1 FROM users WHERE institutional_email = ?').get(institutional_email);
    result.institutional_email = !!r;
  }
  res.json(result);
});

// Theses endpoints
app.post('/theses', authMiddleware, async (req, res) => {
  const { title, abstract, companion, program_ids, keywords } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = uuidv4();
  const created_at = Date.now();
  try {
    db.prepare('INSERT INTO theses (id, title, abstract, keywords, created_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, title, abstract || null, keywords || null, req.user.id, 'draft', created_at);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('NOT NULL')) {
      return res.status(400).json({ error: 'missing required field' });
    }
    throw err;
  }
  // Asociar el estudiante que solicita
  db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
    .run(uuidv4(), id, req.user.id);
  // si se proporciona compañero crearlo y asociar
  if (companion) {
    if (!companion.full_name || !companion.student_code || !companion.cedula || !companion.password) {
      return res.status(400).json({ error: 'companion requires full_name, student_code, cedula and password' });
    }
    // check no duplicate code/cedula
    const dup = db.prepare('SELECT id FROM users WHERE student_code = ? OR cedula = ?').get(companion.student_code, companion.cedula);
    if (dup) {
      return res.status(400).json({ error: 'companion student_code or cedula already used' });
    }
    const compId = uuidv4();
    const hash = await bcrypt.hash(companion.password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(compId,
           companion.student_code + '@estudiante.local',
           hash,
           companion.full_name,
           companion.student_code,
           companion.cedula,
           null);
    db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), compId, 'student');
    db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
      .run(uuidv4(), id, compId);
  }
  // asociar programas si se enviaron
  if (program_ids && Array.isArray(program_ids)) {
    for (const pid of program_ids) {
      db.prepare('INSERT INTO thesis_programs (id, thesis_id, program_id) VALUES (?, ?, ?)')
        .run(uuidv4(), id, pid);
    }
  }
  // Evento inicial en timeline
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), id, 'submitted', 'Tesis registrada por el estudiante', 1, created_at);
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(id);
  res.json(thesis);
});

app.get('/theses', authMiddleware, (req, res) => {
  // Decide qué tesis devolver según el rol del usuario
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  console.log('GET /theses requested by user', req.user.id, 'roles:', roles);
  let rows;
  if (roles.includes('admin') || roles.includes('superadmin')) {
    rows = db.prepare(`SELECT * FROM theses WHERE status != 'deleted' ORDER BY created_at DESC`).all();
  } else if (roles.includes('evaluator')) {
    // sólo tesis asignadas a este evaluador, evitar duplicados si hay registros repetidos
    rows = db.prepare(`
      SELECT DISTINCT t.* FROM theses t
      INNER JOIN thesis_evaluators te ON t.id = te.thesis_id
      WHERE te.evaluator_id = ? AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  } else {
    rows = db.prepare(`
      SELECT t.* FROM theses t
      INNER JOIN thesis_students ts ON t.id = ts.thesis_id
      WHERE ts.student_id = ? AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  }

  // enriquecer con estudiantes, evaluadores y línea de tiempo
  const enriched = rows.map(t => {
    const students = db.prepare(
      `SELECT u.id, u.full_name as name, u.student_code, u.cedula FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ?`
    ).all(t.id);
    const evaluators = db.prepare(
      `SELECT DISTINCT u.id, u.full_name as name, te.due_date, te.is_blind
       FROM users u
       JOIN thesis_evaluators te ON u.id = te.evaluator_id
       WHERE te.thesis_id = ?`
    ).all(t.id).map(ev => ({ ...ev, is_blind: !!ev.is_blind }));
    const directors = db.prepare(
      `SELECT name FROM thesis_directors WHERE thesis_id = ?`
    ).all(t.id).map(r => r.name);
    const programs = db.prepare(
      `SELECT p.id, p.name FROM programs p
       JOIN thesis_programs tp ON p.id = tp.program_id
       WHERE tp.thesis_id = ?`
    ).all(t.id);
    let timeline = db.prepare(
      `SELECT id, event_type as status, description as label, created_at as date, completed
       FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC`
    ).all(t.id);
    // Hide signature events from students
    const isStudentRole = !roles.includes('admin') && !roles.includes('superadmin') && !roles.includes('evaluator');
    if (isStudentRole) {
      timeline = timeline.filter(ev => ev.status !== 'act_signature');
    }
    // enrich assignment/defense entries and prepare evaluator submission events
    let enrichedTimeline = timeline || [];
    if (enrichedTimeline && enrichedTimeline.length && evaluators && evaluators.length) {
      const blind = evaluators.some(e => e.is_blind);
      const count = evaluators.length;
      enrichedTimeline = enrichedTimeline.map(ev => {
        if (ev.status === 'evaluators_assigned') {
          if (blind) {
            ev.label = `Evaluadores asignados (${count}) (pares ciegos)`;
          } else {
            const names = evaluators.map(e => e.name).filter(Boolean);
            ev.label = `Evaluadores asignados (${count})${names.length ? `: ${names.join(', ')}` : ''}`;
          }
        }
        if (ev.status === 'defense_scheduled') {
          ev.label = 'Sustentación programada';
          ev.defense_date = t.defense_date;
          ev.defense_location = t.defense_location;
          ev.defense_info = t.defense_info;
        }
        return ev;
      });
      // remove any old generic submission events so we can re-add detailed ones below
      enrichedTimeline = enrichedTimeline.filter(ev => ev.status !== 'evaluation_submitted');
    }
    // NOTE: detailed evaluation events will be added after we fetch evaluations below
    let files = db.prepare(
      `SELECT id, file_name, file_url, file_type FROM thesis_files WHERE thesis_id = ?`
    ).all(t.id);
    files = files.map(f => ({
      ...f,
      file_url: `/uploads/${path.basename(f.file_url)}`,
    }));
    // evaluations and their files
    const evaluations = db.prepare(
      `SELECT e.*, te.evaluator_id, te.id as thesis_evaluator_id, u.full_name as evaluator_name
       FROM evaluations e
       JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
       LEFT JOIN users u ON u.id = te.evaluator_id
       WHERE te.thesis_id = ?`
    ).all(t.id);
    for (const ev of evaluations) {
      const evfiles = db.prepare(
        `SELECT id, file_name, file_url FROM evaluation_files WHERE evaluation_id = ?`
      ).all(ev.id);
      ev.files = evfiles.map(f => ({
        ...f,
        file_url: `/uploads/${path.basename(f.file_url)}`,
      }));
      const scores = db.prepare(
        `SELECT section_id, criterion_id, score, observations FROM evaluation_scores WHERE evaluation_id = ?`
      ).all(ev.id);
      ev.scores = scores;
    }
    const isBlindReview = evaluators && evaluators.some(e => e.is_blind);
    // after loading individual evaluations we can add detailed submission events
    if (evaluations && Array.isArray(evaluations)) {
      const evalEvents = evaluations.map((ev, index) => {
        const typeWord = ev.evaluation_type === 'presentation' ? 'sustentación' : 'documento';
        const displayName = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        const actorName = isBlindReview ? 'Evaluador (Par ciego)' : (ev.evaluator_name || 'Evaluador');
        const event = {
          id: uuidv4(),
          status: 'evaluation_submitted',
          label: `Evaluación de ${typeWord} enviada por ${displayName}`,
          completed: 1,
          date: ev.submitted_at || ev.created_at,
          actor: actorName,
          actorRole: 'evaluator',
        };
        if (ev.general_observations) event.evaluatorRecommendations = ev.general_observations;
        if (ev.files && ev.files.length) event.evaluatorFiles = ev.files.map(f=>({name:f.file_name,url:f.file_url}));
        return event;
      });
      enrichedTimeline = enrichedTimeline.concat(evalEvents);
      // normalize revision events and attach any revision files
      enrichedTimeline = enrichedTimeline.map(ev => {
        if (ev.status === 'revision_submitted') {
          // keep comment in observations, standardize label
          if (ev.label && ev.label !== 'Revisión enviada por estudiante') {
            ev.observations = ev.label;
          }
          ev.label = 'Revisión enviada por estudiante';

          const revFiles = db.prepare('SELECT file_name, file_url FROM thesis_files WHERE timeline_event_id = ?').all(ev.id);
          if (revFiles && revFiles.length) {
            ev.revisionFiles = revFiles.map(f => ({ name: f.file_name, url: f.file_url }));
          }
        }
        return ev;
      });
    }
    // if every assigned evaluator has provided an evaluation, add a timeline summary event
    if (evaluations && evaluations.length && evaluators && evaluations.length === evaluators.length) {
      const recs = evaluations.map((ev, index) => {
        let text = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        if (ev.general_observations) text += `: ${ev.general_observations}`;
        if (ev.concept) text += ` (concepto: ${ev.concept})`;
        return text;
      }).join("\n\n");
      const filesList = [];
      for (const ev of evaluations) {
        if (ev.files && ev.files.length) {
          ev.files.forEach((f) => filesList.push({ name: f.file_name, url: f.file_url }));
        }
      }
      enrichedTimeline.push({
        id: uuidv4(),
        status: 'evaluations_summary',
        label: 'Evaluaciones recibidas',
        completed: 1,
        date: Math.max(...evaluations.map((e) => e.submitted_at || 0)),
        evaluatorRecommendations: recs,
        evaluatorFiles: filesList,
      });
    }
    // ensure the timeline is ordered by date so scheduled event appears after evaluations
    enrichedTimeline.sort((a,b) => (a.date||0) - (b.date||0));
    const weighted = computeFinalWeightedForThesis(t.id);
    return { ...t, students, evaluators, directors, programs, timeline: enrichedTimeline, files, evaluations, weighted };
  });

  res.json(enriched);
});

app.get('/theses/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const students = db.prepare(
    `SELECT u.id, u.full_name as name, u.student_code, u.cedula, u.email, u.institutional_email FROM users u
     JOIN thesis_students ts ON u.id = ts.student_id
     WHERE ts.thesis_id = ?`
  ).all(id);
  const evaluators = db.prepare(
    `SELECT u.id, u.full_name as name, te.due_date, te.is_blind
     FROM users u
     JOIN thesis_evaluators te ON u.id = te.evaluator_id
     WHERE te.thesis_id = ?`
  ).all(id).map(ev => ({ ...ev, is_blind: !!ev.is_blind }));
  const directors = db.prepare(
    `SELECT name FROM thesis_directors WHERE thesis_id = ?`
  ).all(id).map(r => r.name);
  const programs = db.prepare(
    `SELECT p.id, p.name FROM programs p
     JOIN thesis_programs tp ON p.id = tp.program_id
     WHERE tp.thesis_id = ?`
  ).all(id);

  // also load any evaluations and attach scores/files (needed for evaluators)
  const evaluations = db.prepare(
    `SELECT e.*, te.evaluator_id, te.id as thesis_evaluator_id, u.full_name as evaluator_name
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     LEFT JOIN users u ON u.id = te.evaluator_id
     WHERE te.thesis_id = ?`
  ).all(id);
  for (const ev of evaluations) {
    const evfiles = db.prepare(
      `SELECT id, file_name, file_url FROM evaluation_files WHERE evaluation_id = ?`
    ).all(ev.id);
    ev.files = evfiles.map(f => ({
      ...f,
      file_url: `/uploads/${path.basename(f.file_url)}`,
    }));
    const scores = db.prepare(
      `SELECT section_id, criterion_id, score, observations FROM evaluation_scores WHERE evaluation_id = ?`
    ).all(ev.id);
    ev.scores = scores;
  }

  let timeline = db.prepare(
    `SELECT id, event_type as status, description as label, created_at as date, completed
     FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC`
  ).all(id);
  // Hide signature events from students
  const rolesForFilter = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isStudentRole2 = !rolesForFilter.includes('admin') && !rolesForFilter.includes('superadmin') && !rolesForFilter.includes('evaluator');
  if (isStudentRole2) {
    timeline = timeline.filter(ev => ev.status !== 'act_signature');
  }
  // enrich assignment/defense entries
  if (timeline && timeline.length && evaluators && evaluators.length) {
    const blind = evaluators.some(e => e.is_blind);
    const count = evaluators.length;
    timeline = timeline.map(ev => {
      if (ev.status === 'evaluators_assigned') {
        if (blind) {
          ev.label = `Evaluadores asignados (${count}) (pares ciegos)`;
        } else {
          const names = evaluators.map(e => e.name).filter(Boolean);
          ev.label = `Evaluadores asignados (${count})${names.length ? `: ${names.join(', ')}` : ''}`;
        }
      }
      if (ev.status === 'defense_scheduled') {
        ev.label = 'Sustentación programada';
        ev.defense_date = thesis.defense_date;
        ev.defense_location = thesis.defense_location;
        ev.defense_info = thesis.defense_info;
      }
      return ev;
    });
    // drop old generic submission events; will recreate below
    timeline = timeline.filter(ev => ev.status !== 'evaluation_submitted');
  }
  const isBlindReview = evaluators && evaluators.some(e => e.is_blind);
  // add detailed evaluation_submitted events using actual evaluations
  if (evaluations && Array.isArray(evaluations)) {
    const evalEvents = evaluations.map((ev, index) => {
      const typeWord = ev.evaluation_type === 'presentation' ? 'sustentación' : 'documento';
      const displayName = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
      const actorName = isBlindReview ? 'Evaluador (Par ciego)' : (ev.evaluator_name || 'Evaluador');
      const event = {
        id: uuidv4(),
        status: 'evaluation_submitted',
        label: `Evaluación de ${typeWord} enviada por ${displayName}`,
        completed: 1,
        date: ev.submitted_at || ev.created_at,
        actor: actorName,
        actorRole: 'evaluator',
      };
      if (ev.general_observations) {
        // add comments as recommendations field
        event.evaluatorRecommendations = ev.general_observations;
      }
      if (ev.files && ev.files.length) {
        event.evaluatorFiles = ev.files.map((f) => ({ name: f.file_name, url: f.file_url }));
      }
      return event;
    });
    timeline = timeline.concat(evalEvents);
  }
  // attach revision files to revision_submitted events
  timeline = timeline.map(ev => {
    if (ev.status === 'revision_submitted') {
      // keep any custom label text in observations and set generic label
      if (ev.label && ev.label !== 'Revisión enviada por estudiante') {
        ev.observations = ev.label;
      }
      ev.label = 'Revisión enviada por estudiante';

      const revFiles = db.prepare('SELECT file_name, file_url FROM thesis_files WHERE timeline_event_id = ?').all(ev.id);
      if (revFiles && revFiles.length) {
        ev.revisionFiles = revFiles.map(f => ({ name: f.file_name, url: f.file_url }));
      }
    }
    return ev;
  });
  let files = db.prepare(
    `SELECT id, file_name, file_url, file_type FROM thesis_files WHERE thesis_id = ?`
  ).all(id);
  files = files.map(f => ({
    ...f,
    file_url: `/uploads/${path.basename(f.file_url)}`,
  }));
  // if every assigned evaluator has submitted at least one evaluation, append a summary event
  if (evaluations && evaluations.length && evaluators && evaluators.length) {
    // count unique evaluators in the evaluations array
    const uniqueEvals = new Set(evaluations.map(ev => ev.evaluator_id));
    if (uniqueEvals.size === evaluators.length) {
      const recs = evaluations.map((ev, index) => {
        let text = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        if (ev.general_observations) text += `: ${ev.general_observations}`;
        if (ev.concept) text += ` (concepto: ${ev.concept})`;
        return text;
      }).join("\n\n");
      const filesList = [];
      for (const ev of evaluations) {
        if (ev.files && ev.files.length) {
          ev.files.forEach((f) => filesList.push({ name: f.file_name, url: f.file_url }));
        }
      }
      timeline.push({
        id: uuidv4(),
        status: 'evaluations_summary',
        label: 'Evaluaciones recibidas',
        completed: 1,
        date: Math.max(...evaluations.map((e) => e.submitted_at || 0)),
        evaluatorRecommendations: recs,
        evaluatorFiles: filesList,
      });
    }
  }
  // sort after possibly inserting summary so defense_scheduled (with higher timestamp) comes last
  timeline.sort((a,b) => (a.date||0) - (b.date||0));

  // Compute weighted scores for the student view
  const weighted = computeFinalWeightedForThesis(id);

  res.json({ ...thesis, students, evaluators, directors, programs, timeline, files, evaluations, weighted });
});

// helper to recalc thesis status based on evaluations
function recalcThesisStatus(thesis_id) {
  // consider only the most recent evaluation submitted by each evaluator
  const evals = db.prepare(
    `SELECT e.concept FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ?
     AND e.evaluation_type = 'document'
     AND e.submitted_at = (
         SELECT MAX(submitted_at) FROM evaluations e2
         WHERE e2.thesis_evaluator_id = e.thesis_evaluator_id
         AND e2.evaluation_type = 'document'
       )`
  ).all(thesis_id).map(r => r.concept);
  if (evals.length === 0) return;
  let newStatus = null;
  if (evals.some(c => c === 'major_changes')) {
    newStatus = 'revision_cuidados';
  } else if (evals.some(c => c === 'minor_changes')) {
    newStatus = 'revision_minima';
  } else if (evals.every(c => c === 'accepted') && evals.length >= 2) {
    newStatus = 'sustentacion';
  }
  if (newStatus) {
    const th = db.prepare('SELECT status FROM theses WHERE id = ?').get(thesis_id);
    if (th && th.status !== newStatus) {
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run(newStatus, thesis_id);
      db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), thesis_id, 'status_changed', `Estado cambiado a ${newStatus}`, 1, Date.now());
    }
  }
}

// Evaluations
app.post('/evaluations', authMiddleware, requireRole('evaluator'), (req, res) => {
  const { thesis_id, score, observations, concept, sections, evaluation_type } = req.body;
  if (!thesis_id) return res.status(400).json({ error: 'thesis_id required' });
  const thesisRow = db.prepare('SELECT id, revision_round FROM theses WHERE id = ?').get(thesis_id);
  if (!thesisRow) return res.status(404).json({ error: 'thesis not found' });
  // find corresponding thesis_evaluator record
  const te = db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, req.user.id);
  if (!te) return res.status(403).json({ error: 'not assigned to this thesis' });
  const id = uuidv4();
  const now = Date.now();
  const type = evaluation_type === 'presentation' ? 'presentation' : 'document';
  db.prepare('INSERT INTO evaluations (id, thesis_evaluator_id, concept, evaluation_type, revision_round, final_score, general_observations, submitted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, te.id, concept || null, type, Number(thesisRow.revision_round || 0), score || null, observations || null, now, now);

  // store individual criterion scores if provided
  if (sections && Array.isArray(sections)) {
    const insertScore = db.prepare('INSERT INTO evaluation_scores (id, evaluation_id, section_id, criterion_id, score, observations) VALUES (?, ?, ?, ?, ?, ?)');
    for (const section of sections) {
      for (const criterion of section.criteria || []) {
        if (criterion.score !== undefined && criterion.score !== null) {
          insertScore.run(uuidv4(), id, section.id, criterion.id, criterion.score, criterion.observations || null);
        }
      }
    }
  }

  // add timeline event for admin visibility with evaluator name and type
  // fetch evaluator full name (stored on req.user by auth middleware)
  const evaluatorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user.id);
  const evaluatorName = (evaluatorRow && evaluatorRow.full_name) ? evaluatorRow.full_name : 'Evaluador';
  const descType = type === 'presentation' ? 'sustentación' : 'documento';
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'evaluation_submitted', `Evaluación de ${descType} enviada por ${evaluatorName}`, 1, now);

  // recalc status
  recalcThesisStatus(thesis_id);

  const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
  res.json(evalRow);
});

// schedule sustentación (solo admin)
app.post('/theses/:id/schedule', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { date, location, info } = req.body;
  if (!date || !location) {
    return res.status(400).json({ error: 'date and location required' });
  }
  const ts = Date.parse(date);
  if (isNaN(ts)) {
    return res.status(400).json({ error: 'invalid date' });
  }
  db.prepare('UPDATE theses SET defense_date = ?, defense_location = ?, defense_info = ? WHERE id = ?')
    .run(ts, location, info || null, thesis_id);
  // add timeline entry
  // create a multi‑line description for nicer display
  let desc = `Sustentación programada:\n` +
             `• Fecha: ${new Date(ts).toLocaleString()}\n` +
             `• Lugar: ${location}`;
  if (info) desc += `\n• ${info}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'defense_scheduled', desc, 1, Date.now());
  res.json({ ok: true });
});

// update existing evaluation (evaluador puede editar)
app.put('/evaluations/:id', authMiddleware, requireRole('evaluator'), (req, res) => {
  const evalId = req.params.id;
  const { score, observations, concept, sections } = req.body;
  const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
  if (!evalRow) return res.status(404).json({ error: 'not found' });
  // verify ownership via thesis_evaluator
  const te = db.prepare('SELECT * FROM thesis_evaluators WHERE id = ?').get(evalRow.thesis_evaluator_id);
  if (!te || te.evaluator_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const now = Date.now();
  db.prepare('UPDATE evaluations SET concept = ?, final_score = ?, general_observations = ?, updated_at = ? WHERE id = ?')
    .run(concept || null, score || null, observations || null, now, evalId);
  // replace scores
  db.prepare('DELETE FROM evaluation_scores WHERE evaluation_id = ?').run(evalId);
  if (sections && Array.isArray(sections)) {
    const insertScore = db.prepare('INSERT INTO evaluation_scores (id, evaluation_id, section_id, criterion_id, score, observations) VALUES (?, ?, ?, ?, ?, ?)');
    for (const section of sections) {
      for (const criterion of section.criteria || []) {
        if (criterion.score !== undefined && criterion.score !== null) {
          insertScore.run(uuidv4(), evalId, section.id, criterion.id, criterion.score, criterion.observations || null);
        }
      }
    }
  }
  // recalc thesis status
  if (te && te.thesis_id) {
    recalcThesisStatus(te.thesis_id);
  }
  res.json({ ok: true });
});

// estado y firmas del acta
app.get('/theses/:id/acta/status', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isEvaluatorAssigned = db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin && !isEvaluatorAssigned) return res.status(403).json({ error: 'forbidden' });

  const allEvaluatorsDone = ctx.evaluators.every(ev => hasEvaluatorCompletedRequired(thesisId, ev.id));
  const evaluatorSignatures = ctx.signatures.filter(s => s.signer_role === 'evaluator');
  const directorSignatures = ctx.signatures.filter(s => s.signer_role === 'director');
  const programDirectorSignature = ctx.signatures.find(s => s.signer_role === 'program_director');

  // Determinar si todas las firmas están completas
  const allEvaluatorsSigned = ctx.evaluators.length > 0 && ctx.evaluators.every(ev => evaluatorSignatures.some(s => String(s.signer_user_id) === String(ev.id)));
  const allDirectorsSigned = ctx.directors.length > 0 && ctx.directors.every(d => directorSignatures.some(s => s.signer_name.toLowerCase() === d.toLowerCase()));
  const programDirectorSigned = !!programDirectorSignature;
  const allSigned = allEvaluatorsSigned && allDirectorsSigned && programDirectorSigned;

  res.json({
    ...ctx,
    allEvaluatorsDone,
    missingEvaluatorSignatures: ctx.evaluators.filter(ev => !evaluatorSignatures.some(s => String(s.signer_user_id) === String(ev.id))),
    evaluatorSignatures,
    directorSignatures,
    programDirectorSignature,
    allSigned,
    canEvaluatorSign: !!isEvaluatorAssigned && hasEvaluatorCompletedRequired(thesisId, req.user.id),
    canAdminSign: isAdmin,
  });
});

app.post('/theses/:id/acta/sign-evaluator', authMiddleware, requireRole('evaluator'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });
  const assigned = db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  if (!assigned) return res.status(403).json({ error: 'not assigned' });
  if (!hasEvaluatorCompletedRequired(thesisId, req.user.id)) {
    return res.status(400).json({ error: 'Debe completar evaluación de documento y sustentación antes de firmar' });
  }

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_user_id = ? AND signer_role = ?')
    .get(thesisId, req.user.id, 'evaluator');
  const basename = path.basename(req.file.path);
  if (existing) {
    db.prepare('UPDATE acta_signatures SET file_url = ?, created_at = ? WHERE id = ?').run(basename, Date.now(), existing.id);
    return res.json({ ok: true, updated: true, file_url: `/uploads/${basename}` });
  }

  db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, req.user.id, req.user.full_name || 'Evaluador', 'evaluator', basename, Date.now());

  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', `Firma de acta cargada por evaluador: ${req.user.full_name || 'Evaluador'}`, 1, Date.now());

  res.json({ ok: true, file_url: `/uploads/${basename}` });
});

app.post('/theses/:id/acta/sign-director', authMiddleware, requireRole('admin'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });

  const { director_name } = req.body;
  const thesisDirectors = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesisId).map(r => r.name);
  const signerName = (director_name && director_name.trim()) || thesisDirectors[0] || req.user.full_name || 'Director Proyecto de Grado';
  const basename = path.basename(req.file.path);

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_role = ? AND signer_name = ?')
    .get(thesisId, 'director', signerName);
  if (existing) {
    db.prepare('UPDATE acta_signatures SET file_url = ?, created_at = ? WHERE id = ?').run(basename, Date.now(), existing.id);
  } else {
    db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesisId, req.user.id, signerName, 'director', basename, Date.now());
  }

  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', `Firma de director registrada en acta: ${signerName}`, 1, Date.now());

  res.json({ ok: true, file_url: `/uploads/${basename}`, signer_name: signerName });
});

app.post('/theses/:id/acta/sign-program-director', authMiddleware, requireRole('admin'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });

  const { program_director_name } = req.body;
  const signerName = (program_director_name && program_director_name.trim()) || req.user.full_name || 'Director del Programa';
  const basename = path.basename(req.file.path);

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_role = ?')
    .get(thesisId, 'program_director');
  if (existing) {
    db.prepare('UPDATE acta_signatures SET signer_name = ?, file_url = ?, created_at = ? WHERE id = ?')
      .run(signerName, basename, Date.now(), existing.id);
  } else {
    db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesisId, req.user.id, signerName, 'program_director', basename, Date.now());
  }

  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', `Firma de Director del Programa registrada en acta: ${signerName}`, 1, Date.now());

  res.json({ ok: true, file_url: `/uploads/${basename}`, signer_name: signerName });
});

app.get('/theses/:id/acta/export', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const format = (req.query.format || 'word').toString().toLowerCase();

  // Verificar permisos: admin puede siempre, evaluador solo PDF cuando todas las firmas están completas
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  const isEvaluator = !!db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);

  if (!isAdmin && !isEvaluator) {
    return res.status(403).json({ error: 'No tiene permisos para exportar' });
  }

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Si es evaluador (no admin), solo puede descargar PDF y solo cuando todas las firmas están
  if (!isAdmin && isEvaluator) {
    if (format !== 'pdf') {
      return res.status(403).json({ error: 'Solo puede descargar en formato PDF' });
    }
    const evalSigs = ctx.signatures.filter(s => s.signer_role === 'evaluator');
    const dirSigs = ctx.signatures.filter(s => s.signer_role === 'director');
    const progSig = ctx.signatures.find(s => s.signer_role === 'program_director');
    const allEvalSigned = ctx.evaluators.length > 0 && ctx.evaluators.every(ev => evalSigs.some(s => String(s.signer_user_id) === String(ev.id)));
    const allDirSigned = ctx.directors.length > 0 && ctx.directors.every(d => dirSigs.some(s => s.signer_name.toLowerCase() === d.toLowerCase()));
    const allSigned = allEvalSigned && allDirSigned && !!progSig;
    if (!allSigned) {
      return res.status(403).json({ error: 'El acta aún no tiene todas las firmas completas' });
    }
  }

  const { thesis, students, evaluators, directors, signatures, weighted, programName } = ctx;
  const classification = scoreClassification(weighted.finalScore);
  const mark = (label) => (classification === label ? 'X' : ' ');

  const studentNames = students.map(s => s.name).join(', ');
  const studentCodes = students.map(s => s.student_code || '').filter(Boolean).join(', ');
  const studentIds = students.map(s => s.cedula || '').filter(Boolean).join(', ');
  const evalNames = evaluators.map(e => e.name).join(', ');
  const directorNames = directors.join(', ');
  
  // Obtener la firma del director del programa
  const programDirectorSig = signatures.find(s => s.signer_role === 'program_director');

  // Preparar datos para el template
  const defenseDate = thesis.defense_date ? new Date(Number(thesis.defense_date)) : new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateText = `${defenseDate.getDate()} de ${months[defenseDate.getMonth()]} de ${defenseDate.getFullYear()}`;
  const timeText = defenseDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  
  const templatePath = path.join(__dirname, 'templates', 'acta_template.docx');
  
  // Generar documento con docxtemplater (tanto para Word como PDF)
  if ((format === 'word' || format === 'pdf') && fs.existsSync(templatePath)) {
    try {
      const content = fs.readFileSync(templatePath, 'binary');
      const zip = new PizZip(content);
      
      // Obtener firmatarios por rol
      const directorSigs = signatures.filter((s) => s.signer_role === 'director');
      const evaluatorSigs = signatures.filter((s) => s.signer_role === 'evaluator');
      const allSignatories = [...directorSigs, ...evaluatorSigs];
      
      console.log(`📄 Firmatarios para acta:`);
      console.log(`  Directores: ${directorSigs.length} - ${directorSigs.map(d => d.signer_name).join(', ')}`);
      console.log(`  Evaluadores: ${evaluatorSigs.length} - ${evaluatorSigs.map(e => e.signer_name).join(', ')}`);
      console.log(`  Director programa: ${programDirectorSig?.signer_name || 'N/A'}`);
      
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });

      // Helper para crear texto placeholder de firma
      const firmaText = (sig) => sig ? `[Firma registrada: ${sig.signer_name}]` : '';

      // Calcular año y período de la sustentación
      const defenseYear = defenseDate.getFullYear();
      const defenseMonth = defenseDate.getMonth() + 1;
      const defensePeriod = defenseMonth >= 7 ? 'II' : 'I';

      // Calcular número consecutivo de tesis sustentadas en el mismo período
      // Período I: enero-junio, Período II: julio-diciembre
      const periodStart = defensePeriod === 'I'
        ? new Date(defenseYear, 0, 1).getTime()   // 1 de enero
        : new Date(defenseYear, 6, 1).getTime();   // 1 de julio
      const periodEnd = defensePeriod === 'I'
        ? new Date(defenseYear, 6, 1).getTime()    // 1 de julio
        : new Date(defenseYear + 1, 0, 1).getTime(); // 1 de enero siguiente

      // Contar tesis que ya tienen fecha de sustentación en este período (ordenadas por fecha)
      const thesesInPeriod = db.prepare(
        `SELECT id, defense_date FROM theses
         WHERE defense_date IS NOT NULL
           AND CAST(defense_date AS INTEGER) >= ?
           AND CAST(defense_date AS INTEGER) < ?
         ORDER BY CAST(defense_date AS INTEGER) ASC`
      ).all(periodStart, periodEnd);

      // Encontrar la posición de esta tesis en el período
      let thesisPosition = 1;
      for (let i = 0; i < thesesInPeriod.length; i++) {
        if (thesesInPeriod[i].id === thesis.id) {
          thesisPosition = i + 1;
          break;
        }
      }
      const thesisNumber = String(thesisPosition).padStart(2, '0');

      console.log(`📊 Consecutivo: No. ${thesisNumber} / ${defenseYear}-${defensePeriod}`);
      console.log(`  Tesis en período ${defensePeriod}-${defenseYear}: ${thesesInPeriod.length}`);
      console.log(`  Posición de esta tesis: ${thesisPosition}`);

      console.log('📝 Mapeo de firmas (pares):');
      console.log(`  Director 1: "${directorSigs[0]?.signer_name || ''}" | Director 2: "${directorSigs[1]?.signer_name || ''}"`);
      console.log(`  Evaluador 1: "${evaluatorSigs[0]?.signer_name || ''}" | Evaluador 2: "${evaluatorSigs[1]?.signer_name || ''}"`);
      console.log(`  Director Programa: "${programDirectorSig?.signer_name || ''}"`);

      const templateData = {
        lugar: thesis.defense_location || 'Auditorio por definir',
        fecha: dateText,
        hora: timeText,
        titulo: thesis.title || '',
        estudiantes: studentNames,
        codigos: studentCodes || 'N/A',
        director: directorNames,
        evaluadores: evalNames,
        observaciones: thesis.defense_info || 'Sin observaciones registradas',
        calificacion_letras: scoreToSpanishText(weighted.finalScore),
        nota: Number(weighted.finalScore || 0).toFixed(2),
        fecha_firma: dateText,
        clasificacion: classification,
        marca_laureada: classification === 'APROBADA LAUREADA' ? 'X' : ' ',
        marca_meritoria: classification === 'APROBADA MERITORIA' ? 'X' : ' ',
        marca_aprobada: classification === 'APROBADA' ? 'X' : ' ',
        marca_modificaciones: ' ',
        marca_no_aprobada: classification === 'NO APROBADA' ? 'X' : ' ',
        // Par 1: Directores de tesis (de dos en dos)
        director1_name: directorSigs[0]?.signer_name || directors[0] || '',
        director2_name: directorSigs[1]?.signer_name || directors[1] || '',
        firma_dir1: firmaText(directorSigs[0]),
        firma_dir2: firmaText(directorSigs[1]),
        director1_role: (directorSigs[0]?.signer_name || directors[0]) ? 'Director 1 de Proyecto de Grado' : '',
        director2_role: (directorSigs[1]?.signer_name || directors[1]) ? 'Director 2 de Proyecto de Grado' : '',
        // Par 2: Evaluadores/Jurados (de dos en dos)
        evaluador1_name: evaluatorSigs[0]?.signer_name || evaluators[0]?.name || '',
        evaluador2_name: evaluatorSigs[1]?.signer_name || evaluators[1]?.name || '',
        firma_eval1: firmaText(evaluatorSigs[0]),
        firma_eval2: firmaText(evaluatorSigs[1]),
        evaluador1_role: (evaluatorSigs[0]?.signer_name || evaluators[0]?.name) ? 'Evaluador 1' : '',
        evaluador2_role: (evaluatorSigs[1]?.signer_name || evaluators[1]?.name) ? 'Evaluador 2' : '',
        // Director del Programa
        prog_director_name: programDirectorSig?.signer_name || '',
        firma_prog: firmaText(programDirectorSig),
        prog_director_role: programDirectorSig?.signer_name
          ? `Director del Programa de ${(programName || 'Programa Académico')}`
          : '',
        // Otros
        program_name: (programName || 'Programa Académico').toUpperCase(),
        thesis_number: thesisNumber,
        year: defenseYear,
        period: defensePeriod,
        year_text: (() => {
          const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
          const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
          const tens = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
          function toWords(n) {
            if (n === 0) return '';
            if (n < 10) return units[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) {
              const t = Math.floor(n / 10), u = n % 10;
              if (u === 0) return tens[t];
              if (t === 2) return 'veinti' + units[u];
              return tens[t] + ' y ' + units[u];
            }
            if (n < 1000) {
              const h = Math.floor(n / 100), rest = n % 100;
              const hWord = h === 1 ? (rest === 0 ? 'cien' : 'ciento') : (h === 5 ? 'quinientos' : h === 7 ? 'setecientos' : h === 9 ? 'novecientos' : units[h] + 'cientos');
              return rest === 0 ? hWord : hWord + ' ' + toWords(rest);
            }
            if (n < 10000) {
              const th = Math.floor(n / 1000), rest = n % 1000;
              const thWord = th === 1 ? 'mil' : toWords(th) + ' mil';
              return rest === 0 ? thWord : thWord + ' ' + toWords(rest);
            }
            return String(n);
          }
          return `${defenseYear} (${toWords(defenseYear)})`;
        })(),
        dia_numero: defenseDate.getDate(),
        dia_texto: (() => {
          const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
          const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
          const tens = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
          const d = defenseDate.getDate();
          if (d < 10) return units[d];
          if (d < 20) return teens[d - 10];
          const t = Math.floor(d / 10), u = d % 10;
          if (u === 0) return tens[t];
          if (t === 2) return 'veinti' + units[u];
          return tens[t] + ' y ' + units[u];
        })(),
        mes_nombre: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][defenseDate.getMonth()],
      };

      console.log('📊 templateData claves:', Object.keys(templateData).join(', '));

      doc.render(templateData);

      // Insertar las imágenes de firma en el documento
      const signaturesToInsert = [...allSignatories.filter(Boolean)];
      if (programDirectorSig) {
        signaturesToInsert.push(programDirectorSig);
      }
      
      console.log(`\n🔍 Firmas a insertar: ${signaturesToInsert.length}`);
      signaturesToInsert.forEach((sig, i) => {
        console.log(`  ${i+1}. ${sig.signer_name} (${sig.signer_role}) - URL: ${sig.file_url}`);
      });
      
      let modifiedZip = doc.getZip();

      // Siempre corregir mc:Ignorable (artefacto de python-docx con prefijos ns1, ns2...)
      let docXml = modifiedZip.file('word/document.xml').asText();
      docXml = fixMcIgnorable(docXml);
      modifiedZip.file('word/document.xml', docXml);

      if (signaturesToInsert.length > 0) {
        modifiedZip = insertSignatureImages(modifiedZip, signaturesToInsert);
      }

      const buf = modifiedZip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      // Nombre base: 01-2026-I-CarlosHidalgo-JuanPerez
      const studentFileNames = students.map(s => {
        const parts = (s.name || '').trim().split(/\s+/);
        if (parts.length >= 3) {
          return parts[0] + parts[Math.ceil(parts.length / 2)];
        }
        return parts.join('');
      }).join('-');
      const baseFileName = `${thesisNumber}-${defenseYear}-${defensePeriod}-${studentFileNames}`;

      if (format === 'pdf') {
        // Convertir DOCX a PDF usando LibreOffice headless
        const { execSync } = require('child_process');
        const tmpDocx = path.join('/tmp', `acta_${thesisId}_${Date.now()}.docx`);
        const tmpDir = '/tmp';
        fs.writeFileSync(tmpDocx, buf);
        try {
          execSync(`libreoffice --headless --convert-to pdf --outdir ${tmpDir} "${tmpDocx}"`, {
            timeout: 30000,
            stdio: 'pipe',
          });
          const tmpPdf = tmpDocx.replace(/\.docx$/, '.pdf');
          if (!fs.existsSync(tmpPdf)) {
            throw new Error('LibreOffice no generó el PDF');
          }
          const pdfBuf = fs.readFileSync(tmpPdf);
          // Limpiar archivos temporales
          try { fs.unlinkSync(tmpDocx); } catch {};
          try { fs.unlinkSync(tmpPdf); } catch {};
          
          const pdfFileName = `${baseFileName}.pdf`;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
          return res.send(pdfBuf);
        } catch (convErr) {
          console.error('Error convirtiendo a PDF:', convErr.message);
          try { fs.unlinkSync(tmpDocx); } catch {};
          return res.status(500).json({ error: 'Error al convertir a PDF' });
        }
      }

      // Formato Word
      const actaFileName = `${baseFileName}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${actaFileName}"`);
      return res.send(buf);
    } catch (error) {
      console.error('Error generando acta con template, usando fallback:', error);
      console.error('Stack:', error.stack);
      console.error('Properties:', error.properties);
    }
  }

  // Fallback: generación HTML para Word (método anterior)
  const signHtml = signatures.map(s => `<div style="margin-top:10px"><strong>${s.signer_role === 'evaluator' ? 'Jurado' : 'Director Proyecto de Grado'}: ${s.signer_name}</strong><br/><img src="http://localhost:${PORT}${s.file_url}" style="height:70px"/></div>`).join('');

  const bodyHtml = `
    <html><body style="font-family:Arial; font-size:12px; line-height:1.5">
      <h2 style="text-align:center">ACTA DE SUSTENTACIÓN</h2>
      <p>En ${thesis.defense_location || 'Auditorio por definir'}, a las ${toDateTime(thesis.defense_date)}, se dio inicio a la sustentación pública del proyecto de grado titulado <strong>${thesis.title}</strong>, realizado por ${studentNames} (código(s): ${studentCodes || 'N/A'}, cédula(s): ${studentIds || 'N/A'}). Durante las fases del trabajo se adelantó bajo la dirección de ${directorNames || 'Director por definir'}, mientras que la fase de evaluación contó con el apoyo de los profesores ${evalNames || 'Evaluadores por definir'}.</p>
      <p><strong>OBSERVACIONES:</strong> ${thesis.defense_info || 'Sin observaciones registradas.'}</p>
      <h3>CALIFICACIÓN DE PROYECTO DE GRADO</h3>
      <p>APROBADA LAUREADA ( )</p>
      <p>APROBADA MERITORIA (${mark('APROBADA MERITORIA')})</p>
      <p>APROBADA (${mark('APROBADA')})</p>
      <p>APROBADA CON MODIFICACIONES ( )</p>
      <p>NO APROBADA (${mark('NO APROBADA')})</p>
      <p><strong>EVALUACIÓN EN LETRAS:</strong> ${scoreToSpanishText(weighted.finalScore)} (${Number(weighted.finalScore || 0).toFixed(2)})</p>
      <hr/>
      <h3>Firmas</h3>
      ${signHtml || '<p>Aún no hay firmas cargadas.</p>'}
    </body></html>
  `;

  if (format === 'pdf') {
    const lines = [
      'ACTA DE SUSTENTACIÓN',
      `Proyecto: ${thesis.title}`,
      `Fecha sustentación: ${toDateTime(thesis.defense_date)}`,
      `Lugar: ${thesis.defense_location || 'N/A'}`,
      `Estudiantes: ${studentNames || 'N/A'}`,
      `Códigos: ${studentCodes || 'N/A'}`,
      `Cédulas: ${studentIds || 'N/A'}`,
      `Directores: ${directorNames || 'N/A'}`,
      `Evaluadores: ${evalNames || 'N/A'}`,
      `Clasificación: ${classification}`,
      `Nota final: ${Number(weighted.finalScore || 0).toFixed(2)} (${scoreToSpanishText(weighted.finalScore)})`,
      '--- FIRMAS ---',
      ...signatures.map(s => `${s.signer_role === 'evaluator' ? 'Jurado' : 'Director'}: ${s.signer_name}`),
    ];
    const pdfBuffer = buildSimplePdf(lines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-${thesisId}.pdf"`);
    return res.end(pdfBuffer);
  }

  res.setHeader('Content-Type', 'application/msword');
  res.setHeader('Content-Disposition', `attachment; filename="acta-${thesisId}.doc"`);
  res.send(bodyHtml);
});

// File uploads for evaluations
app.post('/evaluations/:id/files', authMiddleware, upload.single('file'), (req, res) => {
  const evaluation_id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const id = uuidv4();
  const uploaded_at = Date.now();
  const file_name = req.file.originalname;
  const basename = path.basename(req.file.path);
  db.prepare('INSERT INTO evaluation_files (id, evaluation_id, file_name, file_url, uploaded_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, evaluation_id, file_name, basename, uploaded_at);
  res.json({ id, file_name, file_url: `/uploads/${basename}`, uploaded_at });
});

// Serve uploaded files
app.get('/uploads/:file', (req, res) => {
  const file = req.params.file;
  const p = path.join(uploadDir, file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  res.sendFile(p);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
