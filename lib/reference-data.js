// ข้อมูลอ้างอิงทั้งหมด (สาขา/พนักงาน/จุดรวมพล/ที่พัก) ดึงจากตาราง approval_* ใน Supabase
// พี่แก้ไข/อัพเดตได้เองที่หน้า "จัดการข้อมูล" (พนักงาน = แก้ทีละคน, สาขา/ที่พัก = อัพโหลดไฟล์ Excel แทนที่ทั้งชุด)
// รายชื่อพนักงานสายกิจกรรม จะซิงค์อัตโนมัติจากชีต HR ก่อนอ่านทุกครั้งที่รีเฟรช (ดู lib/staff-sync.js)
const { supabase } = require('./supabase');
const { syncActivityStaff } = require('./staff-sync');

const REFRESH_MS = 10 * 60 * 1000;

let cache = { branches: [], hotels: [], staff: [], musterPoints: [], loadedAt: null };
let lastStaffSync = { at: null, count: null, error: null };
let refreshing = null;

// แค่โหลด cache ใหม่จาก DB ตรงๆ ไม่ไปดึงชีต HR มาซิงค์ทับ — ใช้ตอนแอดมินแก้ไขพนักงาน/สาขา/ที่พักเองทีละคน/ทีละไฟล์
// (ถ้าใช้ refreshAll() แทน จะดึงชีต HR มาซิงค์ทับก่อนเสมอ ซึ่งจะเขียนทับสิ่งที่แอดมินเพิ่งแก้เองไปทันที
// ถ้ารหัสพนักงานคนนั้นดันตรงกับแถวในชีต HR ด้วย — เป็นบั๊กที่ทำให้เพศของพนักงานที่เพิ่งเพิ่ม/แก้เองหายไป)
async function refreshCacheOnly() {
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

// ซิงค์ชีต HR ก่อน แล้วค่อยโหลด cache ใหม่ — ใช้ตอนรีเฟรชตามรอบเวลา หรือกดปุ่ม "ซิงค์ตอนนี้" เท่านั้น
async function refreshAll() {
  try {
    const r = await syncActivityStaff();
    lastStaffSync = { at: r.syncedAt, count: r.count, error: null };
  } catch (err) {
    lastStaffSync = { at: lastStaffSync.at, count: lastStaffSync.count, error: err.message };
    console.error('[staff-sync] ซิงค์จากชีต HR ล้มเหลว (ใช้ข้อมูลเดิมในระบบต่อไป):', err.message);
  }
  await refreshCacheOnly();
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
  refreshCacheOnly,
  getBranches: () => cache.branches,
  getHotels: () => cache.hotels,
  getStaff: () => cache.staff,
  getMusterPoints: () => cache.musterPoints,
  getStaffSyncStatus: () => lastStaffSync,
};
