// อ่านระยะทางถนนจริงที่แคชไว้ล่วงหน้า (ตาราง approval_road_distance, เติมโดย scripts/precompute-road-distances.js)
// คืนค่าเป็น Map<to_id, {km, min}> — จุดที่ยังไม่เคยคำนวณ (สาขา/ที่พักเพิ่มใหม่) จะไม่มีอยู่ใน Map
// ผู้เรียกต้อง fallback ไปใช้ haversineKm เองสำหรับจุดที่ไม่เจอ
const { supabase } = require('./supabase');

async function getRoadDistancesFrom(fromKind, fromId) {
  const { data, error } = await supabase
    .from('approval_road_distance')
    .select('to_id, distance_km, duration_min')
    .eq('from_kind', fromKind).eq('from_id', String(fromId));
  if (error) throw new Error('อ่านระยะทางถนนจริงไม่สำเร็จ: ' + error.message);
  const map = new Map();
  for (const row of data) map.set(row.to_id, { km: row.distance_km, min: row.duration_min });
  return map;
}

// ทิศทางกลับ: จุดรวมพลหลายจุด -> สาขาเดียว (ใช้ตอนเช็คเกณฑ์จุดรวมพล)
async function getRoadDistancesTo(fromKind, fromIds, toKind, toId) {
  const { data, error } = await supabase
    .from('approval_road_distance')
    .select('from_id, distance_km, duration_min')
    .eq('from_kind', fromKind).in('from_id', fromIds.map(String))
    .eq('to_kind', toKind).eq('to_id', String(toId));
  if (error) throw new Error('อ่านระยะทางถนนจริงไม่สำเร็จ: ' + error.message);
  const map = new Map();
  for (const row of data) map.set(row.from_id, { km: row.distance_km, min: row.duration_min });
  return map;
}

module.exports = { getRoadDistancesFrom, getRoadDistancesTo };
