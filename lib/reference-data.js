// ข้อมูลอ้างอิงทั้งหมด (สาขา/พนักงาน/จุดรวมพล/ที่พัก) ดึงจากตาราง approval_* ใน Supabase
// พี่แก้ไข/อัพเดตได้เองที่หน้า "จัดการข้อมูล" (พนักงาน = แก้ทีละคน, สาขา/ที่พัก = อัพโหลดไฟล์ Excel แทนที่ทั้งชุด)
const { supabase } = require('./supabase');

const REFRESH_MS = 10 * 60 * 1000;

let cache = { branches: [], hotels: [], staff: [], musterPoints: [], loadedAt: null };
let refreshing = null;

async function refreshAll() {
  const [{ data: branches, error: bErr }, { data: staff, error: sErr }, { data: musterPoints, error: mErr }, { data: hotels, error: hErr }] = await Promise.all([
    supabase.from('approval_branches').select('*').eq('is_active', true),
    supabase.from('approval_staff').select('*'),
    supabase.from('approval_muster_points').select('*'),
    supabase.from('approval_hotels').select('*').eq('is_active', true),
  ]);
  if (bErr) throw new Error('ดึงข้อมูลสาขาไม่สำเร็จ: ' + bErr.message);
  if (sErr) throw new Error('ดึงข้อมูลพนักงานไม่สำเร็จ: ' + sErr.message);
  if (mErr) throw new Error('ดึงข้อมูลจุดรวมพลไม่สำเร็จ: ' + mErr.message);
  if (hErr) throw new Error('ดึงข้อมูลที่พักไม่สำเร็จ: ' + hErr.message);
  cache = { branches, staff, musterPoints, hotels, loadedAt: new Date() };
  console.log(`[reference-data] รีเฟรชแล้ว: ${branches.length} สาขา (active), ${staff.length} พนักงาน, ${musterPoints.length} จุดรวมพล, ${hotels.length} ที่พัก (active)`);
}

async function ensureLoaded() {
  if (cache.loadedAt) return;
  if (!refreshing) refreshing = refreshAll().finally(() => (refreshing = null));
  await refreshing;
}

setInterval(() => {
  refreshAll().catch((err) => console.error('[reference-data] รีเฟรชล้มเหลว:', err.message));
}, REFRESH_MS).unref();

module.exports = {
  ensureLoaded,
  forceRefresh: refreshAll,
  getBranches: () => cache.branches,
  getHotels: () => cache.hotels,
  getStaff: () => cache.staff,
  getMusterPoints: () => cache.musterPoints,
};
