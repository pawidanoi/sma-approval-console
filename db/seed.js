// นำเข้าข้อมูลจริงจากระบบเดิม (สาขา/ที่พัก/ทีม/พนักงาน) ลงฐานข้อมูลต้นแบบนี้
// รันซ้ำได้เรื่อยๆ (ลบของเดิมแล้วใส่ใหม่ทุกครั้ง) - ไม่กระทบข้อมูลจริงในระบบเดิมแต่อย่างใด
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./index');

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'real-reference-data.json'), 'utf8')
);

db.exec('BEGIN');
try {
  db.exec('DELETE FROM branches');
  db.exec('DELETE FROM hotels');
  db.exec('DELETE FROM teams');
  db.exec('DELETE FROM staff');

  const insBranch = db.prepare(
    'INSERT INTO branches (code, name, district, province, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const b of raw.branches) {
    insBranch.run(b.code, b.name, b.district || null, b.province || null, b.lat ?? null, b.lng ?? null);
  }

  const insHotel = db.prepare(
    'INSERT INTO hotels (code, name, province, district, lat, lng, map_link, price_per_night, on_choowap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const h of raw.hotels) {
    insHotel.run(
      h.code, h.name, h.province || null, h.district || null,
      h.lat ?? null, h.lng ?? null, h.map_link || null,
      h.default_price_per_night ?? null, h.on_choowap ? 1 : 0
    );
  }

  const insTeam = db.prepare('INSERT INTO teams (code, name) VALUES (?, ?)');
  for (const t of raw.teams) insTeam.run(t.code, t.name);

  const insStaff = db.prepare(
    'INSERT INTO staff (code, name, nickname, team_code, gender, phone) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const s of raw.staff) {
    insStaff.run(s.code, s.name, s.nickname || null, s.team_code || null, s.gender || null, s.phone || null);
  }

  // ผู้อนุมัติ 2 สาย - ยังไม่รู้รหัสพนักงานจริงของพี่ทีม setup จึงใส่ค่าตั้งต้นไว้ก่อน
  // (แก้ไขได้ที่ตารางนี้โดยตรง หรือบอกรหัสจริงแล้วรัน seed ใหม่)
  db.exec('DELETE FROM approvers');
  const insApprover = db.prepare(
    'INSERT INTO approvers (employee_code, team_category, display_name) VALUES (?, ?, ?)'
  );
  insApprover.run('CMT2400392', 'activity', 'พี่ (สายกิจกรรม)');
  insApprover.run('CMT2699999', 'setup', 'พี่ทีม setup (รหัสตัวอย่าง - ยังไม่ใช่ของจริง)');

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

const counts = {
  branches: db.prepare('SELECT COUNT(*) c FROM branches').get().c,
  hotels: db.prepare('SELECT COUNT(*) c FROM hotels').get().c,
  teams: db.prepare('SELECT COUNT(*) c FROM teams').get().c,
  staff: db.prepare('SELECT COUNT(*) c FROM staff').get().c,
};
console.log('นำเข้าข้อมูลสำเร็จ:', counts);
