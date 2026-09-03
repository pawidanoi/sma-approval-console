// นำเข้าข้อมูลจาก data/*_import.json เข้า Supabase จริง -- รันครั้งเดียวหลัง migration-013 เสร็จ
// รันซ้ำได้ (ลบของเดิมแล้วใส่ใหม่ทุกครั้ง)
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../lib/supabase');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', name), 'utf8'));
}

async function chunkedInsert(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`insert ${table} failed at row ${i}: ${error.message}`);
  }
}

(async () => {
  const branches = readJson('branches_import.json');
  const staff = readJson('staff_import.json');
  const musterPoints = readJson('muster_points_import.json');

  console.log('ลบข้อมูลเดิม...');
  await supabase.from('approval_branches').delete().neq('code', '__none__');
  await supabase.from('approval_staff').delete().neq('code', '__none__');
  await supabase.from('approval_muster_points').delete().neq('id', 0);

  console.log(`นำเข้า ${branches.length} สาขา...`);
  await chunkedInsert('approval_branches', branches);

  console.log(`นำเข้า ${staff.length} พนักงาน...`);
  await chunkedInsert('approval_staff', staff);

  console.log(`นำเข้า ${musterPoints.length} จุดรวมพล...`);
  await chunkedInsert('approval_muster_points', musterPoints);

  const { count: bCount } = await supabase.from('approval_branches').select('*', { count: 'exact', head: true });
  const { count: sCount } = await supabase.from('approval_staff').select('*', { count: 'exact', head: true });
  const { count: mCount } = await supabase.from('approval_muster_points').select('*', { count: 'exact', head: true });
  console.log('นำเข้าสำเร็จ:', { branches: bCount, staff: sCount, musterPoints: mCount });
})().catch((err) => { console.error('นำเข้าล้มเหลว:', err.message); process.exit(1); });
