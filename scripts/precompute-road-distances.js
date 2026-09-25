// รันครั้งเดียว (หรือรันซ้ำเมื่อเพิ่มสาขา/ที่พักใหม่) เพื่อคำนวณระยะทางถนนจริงจาก OpenRouteService
// แล้วเก็บแคชลงตาราง approval_road_distance — หน้าเว็บจะอ่านจากตารางนี้แทนการคำนวณเส้นตรงสด
//
// ใช้: node scripts/precompute-road-distances.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { matrixOneToMany } = require('../lib/ors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ฟรีเทียร์ ORS จำกัด 40 คำขอ/นาที — เว้น 1.6 วิ/คำขอ กันชนโควต้า
const DELAY_MS = 1600;

async function upsertRows(fromKind, fromId, toKind, destinations, results) {
  const rows = destinations
    .map((d, i) => ({
      from_kind: fromKind, from_id: String(fromId),
      to_kind: toKind, to_id: String(d.id),
      distance_km: results[i].distance_km, duration_min: results[i].duration_min,
      computed_at: new Date().toISOString(),
    }))
    .filter((r) => r.distance_km != null);
  if (!rows.length) return;
  const { error } = await supabase.from('approval_road_distance').upsert(rows, { onConflict: 'from_kind,from_id,to_kind,to_id' });
  if (error) throw new Error('บันทึกระยะทางไม่สำเร็จ: ' + error.message);
}

async function run() {
  const { data: branches, error: bErr } = await supabase.from('approval_branches').select('code, lat, lng').eq('is_active', true);
  if (bErr) throw new Error(bErr.message);
  const { data: hotels, error: hErr } = await supabase.from('approval_hotels').select('code, lat, lng').eq('is_active', true);
  if (hErr) throw new Error(hErr.message);
  const { data: musterPoints, error: mErr } = await supabase.from('approval_muster_points').select('id, lat, lng');
  if (mErr) throw new Error(mErr.message);

  const validBranches = branches.filter((b) => b.lat != null && b.lng != null);
  const validHotels = hotels.filter((h) => h.lat != null && h.lng != null);
  const validMuster = musterPoints.filter((m) => m.lat != null && m.lng != null);

  console.log(`สาขามีพิกัด: ${validBranches.length}/${branches.length}, ที่พักมีพิกัด: ${validHotels.length}/${hotels.length}, จุดรวมพลมีพิกัด: ${validMuster.length}/${musterPoints.length}`);
  console.log(`จะยิง ORS ทั้งหมด ${validMuster.length + validBranches.length} ครั้ง (เว้น ${DELAY_MS}ms ต่อครั้ง) ...`);

  let done = 0, failed = 0;
  const total = validMuster.length + validBranches.length;

  // จุดรวมพล -> สาขาทั้งหมด (สำหรับเช็คเกณฑ์ "เกิน 10/60 กม. ถึงจองที่พักได้")
  for (const m of validMuster) {
    try {
      const results = await matrixOneToMany({ lat: m.lat, lng: m.lng }, validBranches.map((b) => ({ lat: b.lat, lng: b.lng })));
      await upsertRows('muster', m.id, 'branch', validBranches.map((b) => ({ id: b.code })), results);
    } catch (err) {
      failed++;
      console.error(`[muster ${m.id}] ล้มเหลว: ${err.message}`);
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${total}`);
    await sleep(DELAY_MS);
  }

  // สาขา -> ที่พักทั้งหมด (สำหรับเรียงที่พักใกล้สุดตอนจอง)
  for (const b of validBranches) {
    try {
      const results = await matrixOneToMany({ lat: b.lat, lng: b.lng }, validHotels.map((h) => ({ lat: h.lat, lng: h.lng })));
      await upsertRows('branch', b.code, 'hotel', validHotels.map((h) => ({ id: h.code })), results);
    } catch (err) {
      failed++;
      console.error(`[branch ${b.code}] ล้มเหลว: ${err.message}`);
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${total}`);
    await sleep(DELAY_MS);
  }

  console.log(`เสร็จแล้ว: สำเร็จ ${total - failed}/${total}, ล้มเหลว ${failed} (จุดที่ล้มเหลวระบบจะ fallback ไปใช้ระยะทางเส้นตรงแทนโดยอัตโนมัติ)`);
}

run().catch((err) => { console.error('สคริปต์ล้มเหลว:', err); process.exit(1); });
