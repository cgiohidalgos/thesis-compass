const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@admin.com';

const admin = db.prepare(
  'SELECT id FROM users WHERE institutional_email = ? OR email = ?'
).get(ADMIN_EMAIL, ADMIN_EMAIL);

if (!admin) {
  console.error(`Admin user not found (tried ${ADMIN_EMAIL}). Aborting.`);
  process.exit(1);
}

const adminId = admin.id;
console.log('Cleaning up database, keeping admin user id:', adminId);

const tx = db.transaction(() => {
  // Remove all thesis/evaluation-related data
  db.prepare('DELETE FROM evaluation_scores').run();
  db.prepare('DELETE FROM evaluation_files').run();
  db.prepare('DELETE FROM evaluations').run();

  db.prepare('DELETE FROM thesis_evaluators').run();
  db.prepare('DELETE FROM thesis_students').run();
  db.prepare('DELETE FROM thesis_files').run();
  db.prepare('DELETE FROM thesis_directors').run();
  db.prepare('DELETE FROM thesis_timeline').run();
  db.prepare('DELETE FROM thesis_programs').run();
  db.prepare('DELETE FROM theses').run();

  // Remove notifications, signatures and related data
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM smtp_config').run();
  db.prepare('DELETE FROM acta_signatures').run();
  db.prepare('DELETE FROM digital_signatures').run();

  // Keep only the admin user and their roles/profile
  db.prepare('DELETE FROM user_roles WHERE user_id != ?').run(adminId);
  db.prepare('DELETE FROM profiles WHERE id != ?').run(adminId);
  db.prepare('DELETE FROM users WHERE id != ?').run(adminId);

  // Reset programs to a known default set (clean state)
  db.prepare('DELETE FROM program_admins').run();
  db.prepare('DELETE FROM programs').run();
  const defaultPrograms = [
    'Ingeniería de Sistemas',
    'Ingeniería Multimedia',
    'Ingeniería Electrónica',
    'Ingeniería Industrial',
  ];
  for (const name of defaultPrograms) {
    db.prepare('INSERT INTO programs (id, name) VALUES (?, ?)').run(uuidv4(), name);
  }
});

try {
  tx();
  console.log('Database cleanup transaction complete.');
} catch (err) {
  console.error('Cleanup failed:', err);
  process.exit(1);
}

// Remove any uploaded files (keep directory structure clean)
try {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    for (const item of fs.readdirSync(uploadsDir)) {
      const fullPath = path.join(uploadsDir, item);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    console.log('Uploads directory emptied.');
  }
} catch (err) {
  console.warn('Failed to clean uploads directory:', err);
}

console.log('System is now clean. Only admin user remains.');
