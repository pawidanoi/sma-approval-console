const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { supabase } = require('./lib/supabase');
const ref = require('./lib/reference-data');
const { haversineKm, roomsNeeded } = require('./lib/geo');
const { parseScheduleCsv } = require('./lib/schedule-import');
const { notifyEmployee } = require('./lib/line-notify');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MISSION_TYPES = {
  activity: ['งานแฟร์', 'งานเปิดสาขาใหม่', 'ประชุม', 'สำรวจพื้นที่', 'ปิดเป้า', 'แฟร์ย้ำ1', 'แฟร์ย้ำ2', 'แฟร์200K', 'เปิดสาขาใหม่'],
  setup: ['แฟร์ย้ำ', 'รีโนเวท', 'เซ็ทร้าน', 'ช่วยงานแกรนด์'],
};
// เกณฑ์ระยะทาง: จุดรวมพล->สาขา ต้อง "เกิน" ค่านี้ถึงจะจองที่พักได้ / สาขา->ที่พัก ต้อง "ไม่เกิน" ค่านี้ ถ้าเกินต้องมีเหตุผล
// musterHardBlock=true (setup): ไม่เกินเกณฑ์ = จองไม่ได้เด็ดขาด
// musterHardBlock=false (activity): ไม่เกินเกณฑ์ = จองได้แต่ต้องใส่หมายเหตุกำกับ (เผื่อกรณีทีมชื่อจังหวัดหนึ่งแต่บ้านจริงอยู่อีกจังหวัด)
const RULES = {
  activity: { musterMinKm: 10, hotelMaxKm: 10, musterHardBlock: false },
  setup: { musterMinKm: 60, hotelMaxKm: 20, musterHardBlock: true },
};

app.use(async (req, res, next) => {
  try { await ref.ensureLoaded(); next(); }
  catch (err) { res.status(503).json({ error: 'ดึงข้อมูลอ้างอิงไม่สำเร็จ: ' + err.message }); }
});

function findBranch(code) { return ref.getBranches().find((b) => b.code === code); }
function findHotel(code) { return ref.getHotels().find((h) => h.code === code); }
function staffRowsFor(code) { return ref.getStaff().filter((s) => s.code === code); }

// ---------- ป้องกันหน้าจัดการข้อมูล: ต้องเป็นผู้อนุมัติ (ทีมไหนก็ได้) ----------
async function requireApprover(req, res, next) {
  const actor = String(req.query.actor || req.body?.actor || '').trim();
  const { data, error } = await supabase.from('approval_staff').select('code, role').eq('code', actor).eq('role', 'ผู้อนุมัติ').limit(1);
  if (error) return res.status(500).json({ error: error.message });
  if (!actor || !data || !data.length) return res.status(403).json({ error: 'หน้านี้สำหรับผู้อนุมัติเท่านั้น' });
  next();
}

// ---------- อ่านไฟล์ Excel สาขา/ที่พัก (รูปแบบเดียวกับที่พี่เคยอัพให้/ที่ระบบเคยส่งออกให้) ----------
function normCell(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function parseCoords(raw) {
  if (raw == null) return [null, null];
  const s = String(raw).trim();
  if (!s) return [null, null];
  const dmsRe = /(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEW])/g;
  const dms = [...s.matchAll(dmsRe)];
  if (dms.length === 2) {
    const toDec = (d) => { const val = Number(d[1]) + Number(d[2]) / 60 + Number(d[3]) / 3600; return (d[4] === 'S' || d[4] === 'W') ? -val : val; };
    const latM = dms.find((d) => d[4] === 'N' || d[4] === 'S');
    const lngM = dms.find((d) => d[4] === 'E' || d[4] === 'W');
    if (latM && lngM) return [Math.round(toDec(latM) * 1e7) / 1e7, Math.round(toDec(lngM) * 1e7) / 1e7];
  }
  const parts = s.split(',').map((p) => p.trim());
  if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
    return [Math.round(Number(parts[0]) * 1e7) / 1e7, Math.round(Number(parts[1]) * 1e7) / 1e7];
  }
  return [null, null];
}
const ACTIVE_BRANCH_STATUSES = new Set(['Active store', 'Set up ร้าน', 'ก่อสร้างแล้ว รอเปิดร้าน', 'ยังไม่ลงเสาเข็ม']);
function parseBranchWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
  const branches = [];
  let newSeq = 0;
  for (const r of rows) {
    const codeCjx = normCell(r[1]), nameTh = normCell(r[2]), nameEn = normCell(r[3]);
    const tambon = normCell(r[4]), amphoe = normCell(r[5]), province = normCell(r[6]), address = normCell(r[7]);
    const latlng = normCell(r[9]), status = normCell(r[18]);
    const name = nameTh || nameEn;
    if (!name) continue;
    let code = codeCjx && codeCjx !== '-' ? codeCjx : null;
    if (!code) { newSeq += 1; code = `NEW-${String(newSeq).padStart(3, '0')}`; }
    const [lat, lng] = parseCoords(latlng);
    branches.push({ code, name, district: amphoe, province, address, lat, lng, status, is_active: ACTIVE_BRANCH_STATUSES.has(status || '') });
  }
  return branches;
}
function parseHotelWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
  const hotels = [];
  for (const r of rows) {
    const code = normCell(r[0]), name = normCell(r[1]);
    if (!code || !name) continue;
    const province = normCell(r[2]), district = normCell(r[3]);
    const lat = r[5] != null && r[5] !== '' ? Number(r[5]) : null;
    const lng = r[6] != null && r[6] !== '' ? Number(r[6]) : null;
    const mapLink = normCell(r[7]);
    const price = r[8] != null && r[8] !== '' ? Number(r[8]) : null;
    hotels.push({ code, name, province, district, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng, map_link: mapLink, price_per_night: isNaN(price) ? null : price, is_active: true });
  }
  return hotels;
}

// ---------- session ----------
const CATEGORY_LABEL = { activity: 'ทีมกิจกรรม', setup: 'ทีม setup' };
app.get('/api/session', (req, res) => {
  const code = String(req.query.code || '').trim();
  const rows = staffRowsFor(code);
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
  const roleOptions = [];
  for (const r of rows) {
    if (r.role === 'ผู้จอง') roleOptions.push({ role: 'booker', category: r.category, label: `ผู้จอง (${CATEGORY_LABEL[r.category]})` });
    if (r.role === 'ผู้อนุมัติ') roleOptions.push({ role: 'approver', category: r.category, label: `ผู้อนุมัติ (${CATEGORY_LABEL[r.category]})` });
  }
  roleOptions.push({ role: 'employee', category: null, label: 'พนักงาน (ดูอย่างเดียว)' });
  res.json({ employee: rows[0], roleOptions });
});

// ---------- reference data ----------
app.get('/api/branches', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = ref.getBranches();
  if (q) rows = rows.filter((b) => b.name.toLowerCase().includes(q) || (b.province || '').toLowerCase().includes(q));
  res.json({ branches: rows.slice(0, 30) });
});

app.get('/api/mission-types', (req, res) => {
  const category = String(req.query.category || '');
  res.json({ missionTypes: MISSION_TYPES[category] || [] });
});

// area (ชื่อเล่นไม่มีคำนำหน้า เช่น "พี่อิ๋ม" -> "อิ๋ม") ใช้จับคู่กับคอลัมน์ area_owner ที่ซิงค์มาจากชีต HR
function bareNickname(nickname) { return String(nickname || '').replace(/^(พี่|คุณ|นาย|นาง|นางสาว)/, '').trim(); }

// ตรวจ room_no ที่ส่งมาจากฟอร์ม — กันข้อมูลเพี้ยนจากฝั่ง client (ห้องเกิน 2 คน หรือเพศปนกันในห้อง
// เดียวกัน) เพราะข้อมูลนี้ผูกกับการจองห้องจริง ไว้ใจฝั่ง client อย่างเดียวไม่ได้. คืน error message
// (string) ถ้าไม่ผ่าน, คืน null ถ้าผ่าน. room_no เป็น null ได้ (ยังไม่จัดห้อง — เช่นแขกที่มาเพิ่มทีหลัง
// ผ่าน add-guests ซึ่งยังไม่มี UI จัดห้องในตอนนี้)
function validateRoomAssignments(guests) {
  const byRoom = new Map();
  for (const g of guests) {
    if (g.room_no == null) continue;
    if (!byRoom.has(g.room_no)) byRoom.set(g.room_no, []);
    byRoom.get(g.room_no).push(g);
  }
  for (const [roomNo, members] of byRoom) {
    if (members.length > 2) return `ห้อง ${roomNo} มีคนเกิน 2 คน`;
    const genders = new Set(members.map((m) => m.gender));
    if (genders.size > 1) return `ห้อง ${roomNo} มีทั้งชายและหญิงปนกัน (ต้องเพศเดียวกันเท่านั้น)`;
  }
  return null;
}

// ทีมที่ผู้จอง (Area) คนนี้มีสิทธิ์จองให้ได้ (ทีมที่ตัวเองดูแล + ทีมตัวเอง) — คืน null ถ้าไม่ใช่ผู้จอง (ไม่จำกัดทีม)
function getOwnedTeams(actorCode, category) {
  const staff = ref.getStaff();
  const actorRow = staff.find((s) => s.code === actorCode && s.category === category);
  if (!actorRow || actorRow.role !== 'ผู้จอง') return null;
  // ทีม setup ไม่แบ่งเขตเหมือนทีมกิจกรรม — AREA คนไหนก็จองแทนได้ทุกทีมสนามในสายนี้
  if (category === 'setup') return new Set(staff.filter((s) => s.category === category).map((s) => s.team_code));
  const actorNick = bareNickname(actorRow.nickname);
  const ownedTeams = new Set(staff.filter((s) => s.category === category && s.area_owner && bareNickname(s.area_owner) === actorNick).map((s) => s.team_code));
  if (actorRow.team_code) ownedTeams.add(actorRow.team_code);
  return ownedTeams;
}

// หาว่า "ทีมนี้" มีผู้จอง (Area) คนไหนดูแลอยู่ — อ่านจาก area_owner ที่ติดไว้กับทีมนั้น แล้วหาเจ้าของชื่อเล่นนั้น
function findAreaOwnerFor(teamCode, category) {
  const staff = ref.getStaff().filter((s) => s.category === category);
  const teamRow = staff.find((s) => s.team_code === teamCode && s.area_owner);
  if (!teamRow) return null;
  const ownerNick = bareNickname(teamRow.area_owner);
  return staff.find((s) => s.role === 'ผู้จอง' && bareNickname(s.nickname) === ownerNick) || null;
}

app.get('/api/teams', (req, res) => {
  const category = String(req.query.category || '');
  const actor = String(req.query.actor || '').trim();
  let rows = ref.getStaff().filter((s) => !category || s.category === category);

  // ผู้จอง (Area) เห็นเฉพาะทีมที่ตัวเองดูแล + ทีมของตัวเอง — กันจองสลับทีมกันเอง
  // พนักงานทั่วไป (หรือใครก็ตามที่ไม่ใช่ผู้จอง) เห็นแค่ทีมตัวเองทีมเดียว — จองแทนทีมอื่นไม่ได้
  const actorRow = actor ? rows.find((s) => s.code === actor) : null;
  const ownedTeams = actor && category ? getOwnedTeams(actor, category) : null;
  if (ownedTeams) {
    rows = rows.filter((s) => ownedTeams.has(s.team_code));
  } else if (actorRow) {
    rows = rows.filter((s) => s.team_code === actorRow.team_code);
  }

  const counts = {};
  for (const r of rows) { if (r.team_code) counts[r.team_code] = (counts[r.team_code] || 0) + 1; }
  const teams = Object.keys(counts).sort().map((code) => ({ code, count: counts[code] }));
  res.json({ teams });
});

app.get('/api/muster-points', (req, res) => {
  const { category, team_code } = req.query;
  const rows = ref.getMusterPoints().filter((m) => m.category === category && m.team_code === team_code);
  res.json({ musterPoints: rows });
});

app.get('/api/muster-check', (req, res) => {
  const { category, team_code, branch_code } = req.query;
  const branch = findBranch(branch_code);
  if (!branch) return res.status(404).json({ error: 'ไม่พบสาขานี้' });
  const rule = RULES[category];
  if (!rule) return res.status(400).json({ error: 'ไม่รู้จักประเภททีมนี้' });
  const points = ref.getMusterPoints().filter((m) => m.category === category && m.team_code === team_code);
  if (!points.length) {
    return res.json({ musterPoints: [], allowedAny: true, needsNoteAny: false, note: 'ไม่มีข้อมูลจุดรวมพลของทีมนี้ ข้ามการตรวจระยะทางจุดรวมพล' });
  }
  const withDist = points.map((p) => {
    const distanceKm = haversineKm(p.lat, p.lng, branch.lat, branch.lng);
    const underThreshold = distanceKm == null || distanceKm <= rule.musterMinKm;
    return { ...p, distanceKm, blocked: underThreshold && rule.musterHardBlock, needsNote: underThreshold && !rule.musterHardBlock, allowed: !(underThreshold && rule.musterHardBlock) };
  });
  res.json({ musterPoints: withDist, allowedAny: withDist.some((p) => p.allowed), needsNoteAny: withDist.some((p) => p.needsNote), musterMinKm: rule.musterMinKm, musterHardBlock: rule.musterHardBlock });
});

app.get('/api/hotels-near', (req, res) => {
  const branch = findBranch(String(req.query.branch || ''));
  if (!branch) return res.status(404).json({ error: 'ไม่พบสาขานี้' });
  // ทีมย่อย: แยกไป 2 สาขาพร้อมกัน แต่พักที่เดียวกัน — จัดอันดับที่พักด้วยระยะทางรวมของทั้ง 2 สาขา (น้อยสุด = ดีสุด)
  const branch2 = req.query.branch2 ? findBranch(String(req.query.branch2)) : null;
  const rule = RULES[req.query.category] || RULES.activity;
  const withDist = ref.getHotels()
    .map((h) => {
      const distA = haversineKm(branch.lat, branch.lng, h.lat, h.lng);
      const distB = branch2 ? haversineKm(branch2.lat, branch2.lng, h.lat, h.lng) : null;
      const distance_km = branch2 ? (distA != null && distB != null ? Math.round((distA + distB) * 10) / 10 : null) : distA;
      return { ...h, distance_km, distance_km_a: distA, distance_km_b: distB };
    })
    .filter((h) => h.distance_km != null)
    .sort((a, b) => a.distance_km - b.distance_km);
  const isFar = branch2
    ? (h) => h.distance_km_a > rule.hotelMaxKm || h.distance_km_b > rule.hotelMaxKm
    : (h) => h.distance_km > rule.hotelMaxKm;
  res.json({
    branch, branch2: branch2 || null,
    near: withDist.filter((h) => !isFar(h)).slice(0, 20),
    far: withDist.filter((h) => isFar(h)).slice(0, 15),
    hotelMaxKm: rule.hotelMaxKm,
  });
});

// รายการ "แผนงานที่ต้องจอง" นำเข้าจาก NSA — กรองด้วยทีมที่ผู้จองคนนี้ดูแล เหมือนหน้าจองปกติ
app.get('/api/schedule-to-book', async (req, res) => {
  const actor = String(req.query.actor || '').trim();
  const { data, error } = await supabase.from('approval_schedule_entries').select('*').is('matched_request_id', null).order('suggested_checkin', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  let rows = data;
  const ownedTeams = getOwnedTeams(actor, 'activity');
  if (ownedTeams) rows = rows.filter((r) => ownedTeams.has(r.team_code));

  const byGroup = new Map();
  for (const r of rows) { const arr = byGroup.get(r.group_key) || []; arr.push(r); byGroup.set(r.group_key, arr); }

  const items = rows.map((r) => {
    const pairedRow = (byGroup.get(r.group_key) || []).find((s) => s.id !== r.id);
    return {
      id: r.id, team_code: r.team_code, row_type: r.row_type, mission_type: r.mission_type,
      branch: findBranch(r.branch_code) || null,
      paired_branch: pairedRow ? findBranch(pairedRow.branch_code) || null : null,
      suggested_checkin: r.suggested_checkin, suggested_checkout: r.suggested_checkout,
    };
  });
  res.json({ items });
});

// ผู้อนุมัติเห็นแผนงานทั้งหมด (จองแล้ว/ยังไม่จอง) พร้อมกดเตือนผู้จองที่รับผิดชอบทีมนั้นได้
app.get('/api/schedule-all', async (req, res) => {
  const category = String(req.query.category || 'activity');
  const { data, error } = await supabase.from('approval_schedule_entries').select('*').eq('team_category', category).order('suggested_checkin', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const byGroup = new Map();
  for (const r of data) { const arr = byGroup.get(r.group_key) || []; arr.push(r); byGroup.set(r.group_key, arr); }
  const requestIds = [...new Set(data.map((r) => r.matched_request_id).filter(Boolean))];
  let requestsById = new Map();
  if (requestIds.length) {
    const { data: reqs } = await supabase.from('approval_requests').select('id,status,hotel_name,confirmation_no').in('id', requestIds);
    requestsById = new Map((reqs || []).map((r) => [r.id, r]));
  }
  const items = data.map((r) => {
    const pairedRow = (byGroup.get(r.group_key) || []).find((s) => s.id !== r.id);
    const areaOwner = findAreaOwnerFor(r.team_code, category);
    const matched = r.matched_request_id ? requestsById.get(r.matched_request_id) : null;
    return {
      id: r.id, team_code: r.team_code, row_type: r.row_type, mission_type: r.mission_type,
      branch: findBranch(r.branch_code) || null,
      paired_branch: pairedRow ? findBranch(pairedRow.branch_code) || null : null,
      suggested_checkin: r.suggested_checkin, suggested_checkout: r.suggested_checkout,
      area_owner: areaOwner ? { code: areaOwner.code, nickname: areaOwner.nickname } : null,
      matched: matched ? { status: matched.status, hotel_name: matched.hotel_name, confirmation_no: matched.confirmation_no } : null,
    };
  });
  res.json({ items });
});

// พนักงานดูแผนงานของทีมตัวเอง — อันไหนจองแล้วพักที่ไหน อันไหนยังไม่จอง
app.get('/api/schedule-mine', async (req, res) => {
  const code = String(req.query.code || '').trim();
  const staffRow = ref.getStaff().find((s) => s.code === code);
  if (!staffRow || !staffRow.team_code) return res.json({ items: [] });
  const { data, error } = await supabase.from('approval_schedule_entries').select('*').eq('team_code', staffRow.team_code).eq('team_category', staffRow.category).order('suggested_checkin', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const byGroup = new Map();
  for (const r of data) { const arr = byGroup.get(r.group_key) || []; arr.push(r); byGroup.set(r.group_key, arr); }
  const requestIds = [...new Set(data.map((r) => r.matched_request_id).filter(Boolean))];
  let requestsById = new Map();
  if (requestIds.length) {
    const { data: reqs } = await supabase.from('approval_requests').select('id,status,hotel_name,confirmation_no').in('id', requestIds);
    requestsById = new Map((reqs || []).map((r) => [r.id, r]));
  }
  const items = data.map((r) => {
    const pairedRow = (byGroup.get(r.group_key) || []).find((s) => s.id !== r.id);
    const matched = r.matched_request_id ? requestsById.get(r.matched_request_id) : null;
    return {
      id: r.id, team_code: r.team_code, row_type: r.row_type, mission_type: r.mission_type,
      branch: findBranch(r.branch_code) || null,
      paired_branch: pairedRow ? findBranch(pairedRow.branch_code) || null : null,
      suggested_checkin: r.suggested_checkin, suggested_checkout: r.suggested_checkout,
      matched: matched ? { status: matched.status, hotel_name: matched.hotel_name, confirmation_no: matched.confirmation_no } : null,
    };
  });
  res.json({ items });
});

app.delete('/api/schedule-entries/:id', requireApprover, async (req, res) => {
  const { error } = await supabase.from('approval_schedule_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete('/api/admin/schedule-entries', requireApprover, async (req, res) => {
  const { error } = await supabase.from('approval_schedule_entries').delete().neq('id', 0);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ลบคำขอจองทั้งหมดในระบบ (สำหรับล้างข้อมูลทดลองเล่นก่อนใช้งานจริง) — guests โดน cascade ลบตามอัตโนมัติ
// แผนงานที่เคยผูกกับคำขอเหล่านี้จะกลับไปเป็น "ยังไม่จอง" (matched_request_id เป็น null อัตโนมัติ)
app.delete('/api/admin/requests-all', requireApprover, async (req, res) => {
  const { error } = await supabase.from('approval_requests').delete().neq('id', 0);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.post('/api/schedule-entries/:id/remind', requireApprover, async (req, res) => {
  const { data: entry } = await supabase.from('approval_schedule_entries').select('*').eq('id', req.params.id).maybeSingle();
  if (!entry) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
  const areaOwner = findAreaOwnerFor(entry.team_code, entry.team_category);
  if (!areaOwner) return res.status(400).json({ error: 'หาผู้รับผิดชอบทีมนี้ไม่เจอ (ยังไม่ได้ตั้ง Area ที่ดูแลทีมนี้)' });
  const branch = findBranch(entry.branch_code);
  const text = `🔔 เตือนจองที่พัก\nทีม ${entry.team_code} · ${branch?.name || '-'}\nเข้าพัก ${entry.suggested_checkin} – ${entry.suggested_checkout}\nรบกวนเข้าไปจองในระบบด้วยนะครับ/ค่ะ`;
  const result = await notifyEmployee(areaOwner.code, text);
  res.json({ ok: true, sent: result.sent, reason: result.reason || null });
});

// เตือนอัตโนมัติทุกวัน: แผนงานที่ยังไม่จอง และเหลืออีก 3 วันจะถึงวันเข้าพัก
async function checkUpcomingScheduleReminders() {
  try {
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 3);
    const targetDate = target.toISOString().slice(0, 10);
    const { data, error } = await supabase.from('approval_schedule_entries').select('*').is('matched_request_id', null).is('reminder_sent_at', null).eq('suggested_checkin', targetDate);
    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      const areaOwner = findAreaOwnerFor(entry.team_code, entry.team_category);
      if (!areaOwner) continue;
      const branch = findBranch(entry.branch_code);
      const text = `🔔 เตือนอัตโนมัติ: อีก 3 วันถึงวันเข้าพัก\nทีม ${entry.team_code} · ${branch?.name || '-'}\nเข้าพัก ${entry.suggested_checkin} – ${entry.suggested_checkout}\nรีบเข้าไปจองที่พักในระบบด้วยนะครับ/ค่ะ`;
      const result = await notifyEmployee(areaOwner.code, text);
      if (result.sent) await supabase.from('approval_schedule_entries').update({ reminder_sent_at: new Date().toISOString() }).eq('id', entry.id);
    }
  } catch (err) { console.error('[schedule-reminder] เช็คแจ้งเตือน 3 วันก่อนเข้าพักล้มเหลว:', err.message); }
}
setInterval(checkUpcomingScheduleReminders, 24 * 60 * 60 * 1000).unref();
checkUpcomingScheduleReminders();

// ---------- ที่พัก: ค้นหา + ประวัติเคยเข้าพัก + รีวิว (เปิดให้ทุกบทบาทดู/เขียนได้) ----------
app.get('/api/hotels', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = ref.getHotels();
  if (q) rows = rows.filter((h) => h.name.toLowerCase().includes(q) || (h.province || '').toLowerCase().includes(q));
  res.json({ hotels: rows.slice(0, 40) });
});

app.get('/api/hotel-reviews', async (req, res) => {
  const hotelCode = String(req.query.hotel_code || '');
  if (!hotelCode) return res.status(400).json({ error: 'ต้องระบุที่พัก' });
  const { data, error } = await supabase.from('approval_hotel_reviews').select('*').eq('hotel_code', hotelCode).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const count = data.length;
  const avg = count ? Math.round((data.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  res.json({ reviews: data, avg, count });
});

app.post('/api/hotel-reviews', upload.array('photos', 6), async (req, res) => {
  const { hotel_code, actor, rating, review_text } = req.body;
  if (!hotel_code) return res.status(400).json({ error: 'ต้องระบุที่พัก' });
  if (!actor) return res.status(400).json({ error: 'ไม่พบรหัสพนักงาน (session หมดอายุ?)' });
  const ratingNum = Number(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: 'ต้องให้คะแนน 1-5 ดาว' });
  const hotel = findHotel(hotel_code);
  if (!hotel) return res.status(404).json({ error: 'ไม่พบที่พักนี้' });
  const reviewer = ref.getStaff().find((s) => s.code === actor);

  const photoUrls = [];
  for (const file of req.files || []) {
    const ext = (file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const storagePath = `${hotel_code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('hotel-review-photos').upload(storagePath, file.buffer, { contentType: file.mimetype });
    if (upErr) return res.status(500).json({ error: 'อัพโหลดรูปไม่สำเร็จ: ' + upErr.message });
    const { data: pub } = supabase.storage.from('hotel-review-photos').getPublicUrl(storagePath);
    photoUrls.push(pub.publicUrl);
  }

  const { data: inserted, error: insErr } = await supabase.from('approval_hotel_reviews').insert({
    hotel_code, employee_code: actor, employee_name: reviewer ? (reviewer.nickname || reviewer.name) : actor,
    rating: ratingNum, review_text: review_text || null, photo_urls: photoUrls,
  }).select().single();
  if (insErr) return res.status(500).json({ error: 'บันทึกรีวิวไม่สำเร็จ: ' + insErr.message });
  res.status(201).json({ review: inserted });
});

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

// คืน Map: employee_code -> รายการคำขอที่ยังเปิดอยู่ทั้งหมด (ไม่ใช่แค่รายการเดียว)
// เพราะคนคนหนึ่งสามารถมีคำขอที่ยังไม่จบได้หลายรายการพร้อมกัน ถ้าวันที่ไม่ชนกัน
async function getOpenBookingsMap() {
  const { data, error } = await supabase
    .from('approval_request_guests')
    .select('employee_code, approval_requests!inner(status, branch_name, checkin_date, checkout_date)')
    .in('approval_requests.status', ['pending', 'booked', 'approved']);
  if (error) throw new Error(error.message);
  const map = new Map();
  for (const row of data) {
    if (!row.employee_code) continue;
    const r = row.approval_requests;
    const arr = map.get(row.employee_code) || [];
    arr.push({ branch: r.branch_name, checkin_date: r.checkin_date, checkout_date: r.checkout_date });
    map.set(row.employee_code, arr);
  }
  return map;
}
// เดิม endpoint /api/staff ใช้ map แบบ "มีคำขอเปิดอยู่ไหม" เฉยๆ (ไม่ดูวันที่) เก็บไว้เพื่อความเข้ากันได้
// เมื่อไม่ได้ส่งวันที่มาด้วย — ถ้าส่งวันที่มา จะเช็คว่าชนกันจริงไหมก่อนถือว่า "บล็อก"
async function getOpenBookingConflict(map, code, checkin, checkout) {
  const list = map.get(code);
  if (!list || !list.length) return null;
  if (!checkin || !checkout) {
    const o = list[0];
    return { branch: o.branch, dates: `${o.checkin_date} – ${o.checkout_date}` };
  }
  const hit = list.find((o) => datesOverlap(checkin, checkout, o.checkin_date, o.checkout_date));
  return hit ? { branch: hit.branch, dates: `${hit.checkin_date} – ${hit.checkout_date}` } : null;
}

app.get('/api/staff', async (req, res) => {
  const { category, team, q, checkin, checkout } = req.query;
  let rows = ref.getStaff();
  if (category) rows = rows.filter((s) => s.category === category);
  if (team) rows = rows.filter((s) => s.team_code === team);
  if (q) {
    const query = String(q).toLowerCase();
    rows = rows.filter((s) => s.name.toLowerCase().includes(query) || (s.nickname || '').toLowerCase().includes(query) || (s.team_code || '').toLowerCase().includes(query));
  }
  try {
    const openMap = await getOpenBookingsMap();
    const staff = await Promise.all(rows.slice(0, 40).map(async (s) => ({ ...s, openBooking: await getOpenBookingConflict(openMap, s.code, checkin, checkout) })));
    res.json({ staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- requests ----------
async function computeDupWarnings(requestId, guests, checkin, checkout) {
  const warnings = [];
  for (const g of guests) {
    if (!g.employee_code) continue;
    const { data: rows } = await supabase
      .from('approval_request_guests')
      .select('request_id, approval_requests!inner(id, status, branch_name, checkin_date, checkout_date)')
      .eq('employee_code', g.employee_code)
      .neq('request_id', requestId)
      .in('approval_requests.status', ['pending', 'booked', 'approved']);
    // เดิมไม่เช็ควันที่เลย แค่เจอชื่อซ้ำในคำขออื่นก็ตีเป็น "ชื่อซ้ำ" ทันที ทำให้คนที่ไปงานติดกัน
    // (เช่น เช็คเอาท์ 17 แล้วเช็คอินงานถัดไปวันที่ 17 เลย) โดนแจ้งเตือนซ้ำผิดๆ ทั้งที่วันที่ไม่ชนกันจริง
    // — กรองด้วย datesOverlap เหมือน getOpenBookingConflict ก่อนถือว่าเป็นการชนกันจริง
    const hit = (rows || []).find((row) => datesOverlap(checkin, checkout, row.approval_requests.checkin_date, row.approval_requests.checkout_date));
    if (hit) {
      const o = hit.approval_requests;
      warnings.push({ employee_code: g.employee_code, name: g.name, conflictBranch: o.branch_name, conflictDates: `${o.checkin_date} – ${o.checkout_date}` });
    }
  }
  return warnings;
}

async function serializeRequest(r) {
  const guests = (r.approval_request_guests || []).sort((a, b) => a.id - b.id);
  const branchHotelKm = r.hotel_lat != null ? haversineKm(r.branch_lat, r.branch_lng, r.hotel_lat, r.hotel_lng) : null;
  const musterBranchKm = r.muster_lat != null ? haversineKm(r.muster_lat, r.muster_lng, r.branch_lat, r.branch_lng) : null;
  const totalKm = (musterBranchKm != null ? musterBranchKm : 0) + (branchHotelKm != null ? branchHotelKm : 0);
  const nights = Math.round((new Date(r.checkout_date) - new Date(r.checkin_date)) / 86400000);
  const dupWarnings = await computeDupWarnings(r.id, guests, r.checkin_date, r.checkout_date);
  const creator = ref.getStaff().find((s) => s.code === r.created_by);
  return {
    ...r,
    createdByName: creator ? (creator.nickname || creator.name) : r.created_by,
    branch: { code: r.branch_code, name: r.branch_name, province: r.branch_province, lat: r.branch_lat, lng: r.branch_lng },
    hotel: r.hotel_code ? { code: r.hotel_code, name: r.hotel_name, price_per_night: r.hotel_price_per_night, map_link: r.hotel_map_link, lat: r.hotel_lat, lng: r.hotel_lng } : null,
    hotelCandidates: r.hotel_candidates || [],
    hotelMaxKm: RULES[r.team_category]?.hotelMaxKm ?? null,
    muster: r.muster_name ? { name: r.muster_name, lat: r.muster_lat, lng: r.muster_lng } : null,
    branchHotelKm, musterBranchKm, totalKm,
    nights,
    rooms: roomsNeeded(guests),
    guests: guests.map((g) => {
      const staff = g.employee_code ? ref.getStaff().find((s) => s.code === g.employee_code) : null;
      const homeDistanceKm = staff && staff.home_lat != null ? haversineKm(staff.home_lat, staff.home_lng, r.branch_lat, r.branch_lng) : null;
      return { ...g, homeDistanceKm, hasHomeCoords: !!(staff && staff.home_lat != null) };
    }),
    dupWarnings,
  };
}

app.post('/api/requests', async (req, res) => {
  const b = req.body;
  const errors = [];
  const rule = RULES[b.team_category];
  if (!rule) errors.push('ต้องเลือกประเภททีม');
  if (!b.mission_type || !(MISSION_TYPES[b.team_category] || []).includes(b.mission_type)) errors.push('ต้องเลือกประเภทงานจากรายการที่กำหนด');
  if (!b.team_code) errors.push('ต้องเลือกทีมที่เดินทาง');
  if (!b.branch_code) errors.push('ต้องเลือกสาขา');
  if (!b.checkin_date || !b.checkout_date) errors.push('ต้องระบุวันเข้าพัก-เช็คเอาท์');
  if (!b.created_by) errors.push('ไม่พบผู้สร้างคำขอ (session หมดอายุ?)');
  if (!Array.isArray(b.guests) || b.guests.length === 0) errors.push('ต้องมีผู้เข้าพักอย่างน้อย 1 คน');

  const hotelCodes = Array.isArray(b.hotel_codes) ? [...new Set(b.hotel_codes.filter(Boolean))] : [];
  if (hotelCodes.length < 3) errors.push('ต้องเลือกที่พักอย่างน้อย 3 อันดับ (หลัก 1 + สำรอง)');
  if (hotelCodes.length > 5) errors.push('เลือกที่พักได้สูงสุด 5 อันดับ');
  const hotelCandidates = hotelCodes.map((code) => findHotel(code)).filter(Boolean);
  if (hotelCandidates.length !== hotelCodes.length) errors.push('มีที่พักบางอันดับที่ไม่พบในข้อมูลอ้างอิง');
  const hotel = hotelCandidates[0] || null;

  const branch = findBranch(b.branch_code);
  if (!branch) errors.push('ไม่พบสาขานี้ในข้อมูลอ้างอิง');

  // ผู้จอง (Area) จองได้เฉพาะทีมที่ตัวเองดูแล + ทีมตัวเอง — กันจองสลับทีมกันเอง
  // พนักงานทั่วไป (ไม่ใช่ผู้จอง) จองได้แค่ทีมตัวเองทีมเดียว
  if (b.created_by && b.team_code) {
    const creatorRow = ref.getStaff().find((s) => s.code === b.created_by && s.category === b.team_category);
    const ownedTeams = creatorRow ? getOwnedTeams(b.created_by, b.team_category) : null;
    if (ownedTeams) {
      if (!ownedTeams.has(b.team_code)) errors.push('คุณไม่มีสิทธิ์จองให้ทีมนี้ (ไม่ใช่ทีมที่ดูแลหรือทีมตัวเอง)');
    } else if (creatorRow) {
      if (b.team_code !== creatorRow.team_code) errors.push('คุณจองได้เฉพาะทีมของตัวเองเท่านั้น');
    }
  }

  let muster = null;
  if (rule && b.team_code && branch) {
    const points = ref.getMusterPoints().filter((m) => m.category === b.team_category && m.team_code === b.team_code);
    if (points.length) {
      muster = points.find((p) => p.muster_name === b.muster_name) || points[0];
      const dist = haversineKm(muster.lat, muster.lng, branch.lat, branch.lng);
      const underThreshold = dist == null || dist <= rule.musterMinKm;
      if (underThreshold && rule.musterHardBlock) {
        errors.push(`ระยะทางจากจุดรวมพล (${muster.muster_name}) ถึงสาขานี้แค่ ${dist} กม. (ต้องเกิน ${rule.musterMinKm} กม. ถึงจะจองที่พักได้) — ไม่ต้องจองที่พักสำหรับสาขานี้`);
      } else if (underThreshold && !rule.musterHardBlock && !String(b.muster_reason || '').trim()) {
        errors.push(`ระยะทางจากจุดรวมพล (${muster.muster_name}) ถึงสาขานี้แค่ ${dist} กม. (ไม่เกิน ${rule.musterMinKm} กม.) ต้องระบุหมายเหตุกำกับว่าทำไมยังต้องพัก`);
      }
    }
  }

  if (rule && branch && hotelCandidates.length) {
    const farOnes = hotelCandidates
      .map((h) => ({ h, dist: haversineKm(branch.lat, branch.lng, h.lat, h.lng) }))
      .filter((x) => x.dist != null && x.dist > rule.hotelMaxKm);
    if (farOnes.length && !String(b.far_reason || '').trim()) {
      errors.push(`ที่พักที่เลือก ${farOnes.length} อันดับห่างสาขาเกิน ${rule.hotelMaxKm} กม. (${farOnes.map((x) => `${x.h.name} ${x.dist} กม.`).join(', ')}) ต้องระบุเหตุผลกำกับ`);
    }
  }

  // กันจองซ้ำ: ห้ามมีใครในรายชื่อที่มีคำขออื่นซึ่งยังเปิดอยู่ "และ" วันที่ชนกันจริง
  // (คนคนเดียวจองสองแผนต่างวันที่ไม่ชนกันได้ เช่น จัดงานคนละวันในเดือนเดียวกัน)
  if (Array.isArray(b.guests) && b.checkin_date && b.checkout_date) {
    try {
      const openMap = await getOpenBookingsMap();
      for (const g of b.guests) {
        if (!g.employee_code) continue;
        const conflict = await getOpenBookingConflict(openMap, g.employee_code, b.checkin_date, b.checkout_date);
        if (conflict) errors.push(`${g.name} มีแผนจองอยู่แล้ว (${conflict.branch} ${conflict.dates}) ซึ่งวันที่ชนกัน ไม่สามารถจองซ้ำได้`);
      }
    } catch (err) { errors.push('ตรวจสอบการจองซ้ำไม่สำเร็จ: ' + err.message); }
  }

  if (Array.isArray(b.guests)) {
    const roomErr = validateRoomAssignments(b.guests);
    if (roomErr) errors.push(roomErr);
  }

  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const hotelCandidatesJson = hotelCandidates.map((h) => ({ code: h.code, name: h.name, lat: h.lat, lng: h.lng, price_per_night: h.price_per_night, map_link: h.map_link, stay_count: h.stay_count || 0 }));
  const { data: inserted, error: insErr } = await supabase.from('approval_requests').insert({
    team_category: b.team_category,
    mission_type: b.mission_type,
    team_code: b.team_code,
    branch_code: branch.code, branch_name: branch.name, branch_province: branch.province, branch_lat: branch.lat, branch_lng: branch.lng,
    checkin_date: b.checkin_date, checkout_date: b.checkout_date,
    hotel_code: hotel.code, hotel_name: hotel.name, hotel_price_per_night: hotel.price_per_night, hotel_map_link: hotel.map_link, hotel_lat: hotel.lat, hotel_lng: hotel.lng,
    hotel_candidates: hotelCandidatesJson,
    muster_name: muster ? muster.muster_name : null, muster_lat: muster ? muster.lat : null, muster_lng: muster ? muster.lng : null,
    muster_reason: b.muster_reason || null,
    far_reason: b.far_reason || null,
    created_by: b.created_by,
  }).select().single();
  if (insErr) return res.status(500).json({ error: 'บันทึกคำขอไม่สำเร็จ: ' + insErr.message });

  if (b.schedule_entry_id) {
    await supabase.from('approval_schedule_entries').update({ matched_request_id: inserted.id }).eq('id', b.schedule_entry_id);
  }

  const approverRow = ref.getStaff().find((s) => s.category === b.team_category && s.role === 'ผู้อนุมัติ');
  if (approverRow) {
    notifyEmployee(approverRow.code, `📋 มีคำขอจองใหม่รออนุมัติ\nทีม ${b.team_code} · ${branch.name}\n${b.checkin_date} – ${b.checkout_date}`).catch((err) => console.error('[line-notify] แจ้งผู้อนุมัติไม่สำเร็จ:', err.message));
  }

  const guestRows = b.guests.map((g) => ({ request_id: inserted.id, employee_code: g.employee_code || null, name: g.name, phone: g.phone || null, gender: g.gender || null, room_no: g.room_no ?? null }));
  const { error: guestErr } = await supabase.from('approval_request_guests').insert(guestRows);
  if (guestErr) return res.status(500).json({ error: 'บันทึกรายชื่อผู้เข้าพักไม่สำเร็จ: ' + guestErr.message });

  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', inserted.id).single();
  res.status(201).json({ request: await serializeRequest(full) });
});

app.get('/api/requests', async (req, res) => {
  const { actor, role, category, status } = req.query;
  let query = supabase.from('approval_requests').select('*, approval_request_guests(*)');
  if (role === 'approver' && category) query = query.eq('team_category', category).order('created_at', { ascending: true });
  else if (actor && role === 'booker') {
    // AREA ต้องเห็นคำขอทุกอันของทีมที่ตัวเองดูแล ไม่ใช่แค่อันที่ตัวเองเป็นคนสร้าง — เพราะตอนนี้พนักงานเองก็สร้างคำขอได้แล้ว
    const ownedTeams = getOwnedTeams(actor, category || 'activity');
    query = ownedTeams
      ? query.in('team_code', [...ownedTeams]).order('created_at', { ascending: false })
      : query.eq('created_by', actor).order('created_at', { ascending: false });
  } else if (actor) query = query.eq('created_by', actor).order('created_at', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: await Promise.all(data.map(serializeRequest)) });
});

app.get('/api/requests/:id', async (req, res) => {
  const { data: r, error } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
  res.json({ request: await serializeRequest(r) });
});

app.get('/api/employee-lookup', async (req, res) => {
  const code = String(req.query.code || '').trim();
  const rows = staffRowsFor(code);
  if (!rows.length) return res.status(404).json({ error: 'ไม่พบรหัสพนักงานนี้' });
  const { data: guestRows, error } = await supabase
    .from('approval_request_guests')
    .select('request_id, approval_requests(*, approval_request_guests(*))')
    .eq('employee_code', code);
  if (error) return res.status(500).json({ error: error.message });
  const seen = new Set();
  const requests = [];
  for (const row of guestRows || []) {
    const r = row.approval_requests;
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    requests.push(r);
  }
  requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ employee: rows[0], requests: await Promise.all(requests.map(serializeRequest)) });
});

app.patch('/api/requests/:id', async (req, res) => {
  const id = req.params.id;
  const { data: r } = await supabase.from('approval_requests').select('*').eq('id', id).maybeSingle();
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
  const { action, actor, reason, confirmation_no, chosen_hotel_code } = req.body;
  let update = null;

  if (action === 'book') {
    // AREA เลือกที่พักที่จะจองจริง — ยังไม่มีเลขยืนยัน เพราะยังไม่ได้อนุมัติ (เลขยืนยันตัวจริงจะได้ตอน
    // จองใน Choowap จริงหลังเจ้าของทีมอนุมัติแล้ว ไปกรอกพร้อมวอยเชอร์ในขั้น finalize)
    if (r.status !== 'pending') return res.status(400).json({ error: 'จองได้เฉพาะคำขอที่ยังไม่มีใครจองเท่านั้น' });
    const candidates = r.hotel_candidates || [];
    const chosen = candidates.find((h) => h.code === chosen_hotel_code) || candidates.find((h) => h.code === r.hotel_code);
    if (!chosen) return res.status(400).json({ error: 'ต้องเลือกว่าจะจองที่พักอันไหนจากอันดับที่เลือกไว้' });
    update = {
      status: 'booked', booked_by: actor, booked_at: new Date().toISOString(),
      hotel_code: chosen.code, hotel_name: chosen.name, hotel_lat: chosen.lat, hotel_lng: chosen.lng,
      hotel_price_per_night: chosen.price_per_night, hotel_map_link: chosen.map_link,
    };
  } else if (action === 'approve') {
    if (r.status !== 'booked') return res.status(400).json({ error: 'คำขอนี้ยังไม่ได้จองใน Choowap ให้ AREA จองก่อนถึงจะอนุมัติได้' });
    update = { status: 'approved', approved_by: actor, approved_at: new Date().toISOString() };
  } else if (action === 'reject') {
    if (!reason) return res.status(400).json({ error: 'ต้องระบุเหตุผลตีกลับ' });
    // ตีกลับจาก 'booked' (ไม่เอาที่พักที่จองมา) ให้ย้อนกลับไป 'pending' เพื่อให้ AREA ลองจองที่พักอันดับอื่นแทน
    // ตีกลับจากสถานะอื่น (ยังไม่จอง) ถือว่าไม่เอาทั้งแผนนี้เลย จบที่ 'rejected' เหมือนเดิม
    update = r.status === 'booked'
      ? { status: 'pending', reject_reason: reason }
      : { status: 'rejected', reject_reason: reason };
  } else {
    return res.status(400).json({ error: 'ไม่รู้จัก action นี้' });
  }

  const { error: updErr } = await supabase.from('approval_requests').update(update).eq('id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', id).single();
  res.json({ request: await serializeRequest(full) });
});

// ลบคำขอทิ้งทั้งรายการ (ไม่ใช่แค่ตีกลับ) — สำหรับคำขอที่สร้างผิด/ซ้ำซ้อน ต้องเอาออกจากระบบจริงๆ
// จำกัดสิทธิ์เหมือนจุดเปลี่ยนที่พักตอน finalize: ผู้อนุมัติของทีมนั้น หรือ AREA ที่ดูแลทีมนั้นเท่านั้น
// ห้ามลบสถานะ 'done' เพราะมีวอยเชอร์/เลขยืนยันจริงแล้ว ถือเป็นประวัติการจองที่เกิดขึ้นจริง (ต้องเก็บไว้)
app.delete('/api/requests/:id', async (req, res) => {
  const id = req.params.id;
  const actor = String(req.query.actor || req.body?.actor || '').trim();
  const { data: r } = await supabase.from('approval_requests').select('*').eq('id', id).maybeSingle();
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
  if (r.status === 'done') return res.status(400).json({ error: 'ลบไม่ได้เพราะจองสำเร็จแล้ว ถือเป็นประวัติการจองที่เกิดขึ้นจริง' });

  // ลบคำขอได้เฉพาะผู้อนุมัติของทีมนั้นเท่านั้น (ไม่รวม AREA/ผู้จอง) — ตัดสิทธิ์ AREA ออกตามคำขอ
  const isApprover = ref.getStaff().some((s) => s.code === actor && s.category === r.team_category && s.role === 'ผู้อนุมัติ');
  if (!isApprover) {
    return res.status(403).json({ error: 'ลบคำขอได้เฉพาะผู้อนุมัติเท่านั้น' });
  }

  await supabase.from('approval_request_guests').delete().eq('request_id', id);
  // คืนแผนงานที่เคยผูกกับคำขอนี้กลับไปเป็น "ยังไม่จอง" แทนที่จะหายไปเงียบๆ
  await supabase.from('approval_schedule_entries').update({ matched_request_id: null }).eq('matched_request_id', id);
  const { error: delErr } = await supabase.from('approval_requests').delete().eq('id', id);
  if (delErr) return res.status(500).json({ error: delErr.message });
  res.json({ ok: true });
});

// ขั้นตอนสุดท้ายหลังเจ้าของทีมอนุมัติการจองแล้ว — AREA แค่ยืนยันที่พักที่ได้จริงอีกครั้ง (แก้ได้ถ้าเปลี่ยน)
// ไม่ต้องแนบวอยเชอร์/เลขยืนยันแล้ว (ตัดออกตามคำขอ — เดิมบังคับแนบรูปวอยเชอร์+เลขยืนยันก่อนปิดงานได้)
app.post('/api/requests/:id/finalize', async (req, res) => {
  const id = req.params.id;
  const { actor, chosen_hotel_code } = req.body;
  const { data: r } = await supabase.from('approval_requests').select('*').eq('id', id).maybeSingle();
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
  if (r.status !== 'approved') return res.status(400).json({ error: 'ต้องรอเจ้าของทีมอนุมัติการจองก่อนถึงจะยืนยันปิดงานได้' });

  const candidates = r.hotel_candidates || [];
  const chosen = candidates.find((h) => h.code === chosen_hotel_code) || candidates.find((h) => h.code === r.hotel_code);
  if (!chosen) return res.status(400).json({ error: 'ต้องเลือกว่าได้ที่พักอันไหนจริงจากอันดับที่เลือกไว้' });

  // เปลี่ยนที่พักไปจากที่ล็อกไว้ตอนอนุมัติได้ (เช่น ที่พักเต็มจริง) แต่จำกัดคนที่แก้ได้แค่เจ้าของทีม
  // (ผู้อนุมัติ) หรือ AREA ที่ดูแลทีมนี้เท่านั้น — ยืนยันด้วยที่พักเดิมยังทำได้ตามปกติไม่ต้องเช็คสิทธิ์
  // เพิ่ม เพราะเป็น flow ปกติที่ AREA ยืนยันปิดงานทุกครั้งอยู่แล้ว
  if (chosen.code !== r.hotel_code) {
    const isApprover = ref.getStaff().some((s) => s.code === actor && s.category === r.team_category && s.role === 'ผู้อนุมัติ');
    const ownedTeams = getOwnedTeams(actor, r.team_category);
    const isOwningBooker = ownedTeams && ownedTeams.has(r.team_code);
    if (!isApprover && !isOwningBooker) {
      return res.status(403).json({ error: 'เปลี่ยนที่พักตอนนี้ได้เฉพาะเจ้าของทีมหรือ AREA ที่ดูแลทีมนี้เท่านั้น' });
    }
  }

  const update = {
    status: 'done', done_by: actor, done_at: new Date().toISOString(),
    hotel_code: chosen.code, hotel_name: chosen.name, hotel_lat: chosen.lat, hotel_lng: chosen.lng,
    hotel_price_per_night: chosen.price_per_night, hotel_map_link: chosen.map_link,
  };
  const { error: updErr } = await supabase.from('approval_requests').update(update).eq('id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', id).single();
  res.json({ request: await serializeRequest(full) });
});

// รายการจองที่ "อนุมัติแล้ว" หรือ "สำเร็จ" แล้ว และยังไม่เช็คเอาท์ ที่มีห้องว่างเหลือ (เศษเพศเดียวกัน)
// — กดเพิ่มผู้เข้าพักเข้าไปในห้องที่มีอยู่แล้วได้เลย ไม่ต้องจองใหม่ (รวม "อนุมัติแล้ว" ด้วย เพราะผู้อนุมัติ
// ต้องการเห็น/เพิ่มคนได้ทันทีที่กดอนุมัติ ไม่ต้องรอให้คนจองไปกรอกเลขยืนยันจากโรงแรมก่อน)
// หมายเหตุ: ตั้งชื่อ path แยกจาก /api/requests/:id เพราะถ้าใช้ /api/requests/vacancies express จะจับ "vacancies" เป็น :id ก่อน (ชนกับ route ที่ประกาศไว้ก่อนหน้านี้)
app.get('/api/vacancies', async (req, res) => {
  const { category } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  let query = supabase.from('approval_requests').select('*, approval_request_guests(*)').in('status', ['booked', 'approved', 'done']).gte('checkout_date', today);
  if (category) query = query.eq('team_category', category);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const reqs = await Promise.all(data.map(serializeRequest));
  const vacancies = reqs.map((r) => {
    const male = r.guests.filter((g) => g.gender === 'M').length;
    const female = r.guests.filter((g) => g.gender === 'F').length;
    const spareGender = male % 2 === 1 ? 'M' : female % 2 === 1 ? 'F' : null;
    const inStay = r.checkin_date <= today;
    return spareGender ? { ...r, spareGender, maleCount: male, femaleCount: female, inStay } : null;
  }).filter(Boolean);
  vacancies.sort((a, b) => new Date(a.checkin_date) - new Date(b.checkin_date));
  res.json({ vacancies });
});

// เพิ่มผู้เข้าพักเข้าไปในคำขอที่ "อนุมัติแล้ว" หรือ "สำเร็จ" แล้ว (มีห้องว่างเหลือ) — ไม่ต้องขออนุมัติใหม่ เพราะที่พัก/วันที่/ทีมเดิมไม่เปลี่ยน
app.post('/api/requests/:id/add-guests', async (req, res) => {
  const id = req.params.id;
  const { actor, guests } = req.body;
  if (!Array.isArray(guests) || !guests.length) return res.status(400).json({ error: 'ต้องระบุผู้เข้าพักที่จะเพิ่มอย่างน้อย 1 คน' });
  const { data: r } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', id).maybeSingle();
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
  if (!['booked', 'approved', 'done'].includes(r.status)) return res.status(400).json({ error: 'เพิ่มผู้เข้าพักได้เฉพาะรายการที่จองแล้ว อนุมัติแล้ว หรือสำเร็จแล้วเท่านั้น' });

  const existingCodes = new Set((r.approval_request_guests || []).map((g) => g.employee_code).filter(Boolean));
  const errors = [];
  try {
    const openMap = await getOpenBookingsMap();
    for (const g of guests) {
      if (!g.name) { errors.push('ต้องระบุชื่อผู้เข้าพัก'); continue; }
      if (g.employee_code) {
        if (existingCodes.has(g.employee_code)) { errors.push(`${g.name} อยู่ในรายการนี้อยู่แล้ว`); continue; }
        const conflict = await getOpenBookingConflict(openMap, g.employee_code, r.checkin_date, r.checkout_date);
        if (conflict) errors.push(`${g.name} มีแผนจองอยู่แล้ว (${conflict.branch} ${conflict.dates}) ซึ่งวันที่ชนกัน ไม่สามารถเพิ่มซ้ำได้`);
      }
    }
  } catch (err) { errors.push('ตรวจสอบการจองซ้ำไม่สำเร็จ: ' + err.message); }
  const roomErr = validateRoomAssignments([...(r.approval_request_guests || []), ...guests]);
  if (roomErr) errors.push(roomErr);
  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const guestRows = guests.map((g) => ({ request_id: Number(id), employee_code: g.employee_code || null, name: g.name, phone: g.phone || null, gender: g.gender || null, room_no: g.room_no ?? null }));
  const { error: insErr } = await supabase.from('approval_request_guests').insert(guestRows);
  if (insErr) return res.status(500).json({ error: 'เพิ่มผู้เข้าพักไม่สำเร็จ: ' + insErr.message });

  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', id).single();
  res.json({ request: await serializeRequest(full) });
});

app.get('/api/analysis', async (req, res) => {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*, approval_request_guests(*)')
    .in('status', ['pending', 'booked', 'approved']);
  if (error) return res.status(500).json({ error: error.message });
  const reqs = await Promise.all(data.map(serializeRequest));

  const overlaps = (a, b) => new Date(a.checkin_date) < new Date(b.checkout_date) && new Date(b.checkin_date) < new Date(a.checkout_date);
  const genderCounts = (r) => {
    const male = r.guests.filter((g) => g.gender === 'M').length;
    const female = r.guests.filter((g) => g.gender === 'F').length;
    return { oddMale: male % 2 === 1, oddFemale: female % 2 === 1 };
  };
  const FUEL_BAHT_PER_KM = 6;
  const brief = (r) => ({ id: r.id, branch: r.branch.name, team: r.team_code, dates: `${r.checkin_date} – ${r.checkout_date}`, hotel: r.hotel?.name, guests: r.guests.length });

  const sameHotelGroup = []; // Type A: อยู่ที่พักเดียวกันอยู่แล้ว รวมห้องได้ไหม
  const nearbyBranchGroup = []; // Type B: สาขาใกล้กัน ย้ายไปพักที่เดียวกันได้ไหม

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i], b = reqs[j];
      if (!overlaps(a, b)) continue;
      if (!a.hotel || !b.hotel || a.branch.lat == null || b.branch.lat == null) continue;

      const gA = genderCounts(a), gB = genderCounts(b);
      const sameGenderLeftover = (gA.oddMale && gB.oddMale) || (gA.oddFemale && gB.oddFemale);
      const sameHotel = a.hotel_code && a.hotel_code === b.hotel_code;

      if (sameHotel) {
        if (!sameGenderLeftover) continue; // อยู่ที่เดียวกันอยู่แล้วแต่ไม่มีเศษเพศเดียวกัน ไม่มีอะไรให้แนะนำเพิ่ม
        sameHotelGroup.push({ a: brief(a), b: brief(b), hotel: a.hotel.name, roomsBefore: a.rooms + b.rooms, roomsAfter: roomsNeeded([...a.guests, ...b.guests]) });
        continue;
      }

      const branchKm = haversineKm(a.branch.lat, a.branch.lng, b.branch.lat, b.branch.lng);
      if (branchKm == null || branchKm > 10 || !sameGenderLeftover) continue; // ไม่ใกล้กันพอ หรือรวมแล้วไม่ได้ลดห้องจริง ไม่มีประโยชน์จะแนะนำ

      const distAtoA = haversineKm(a.branch.lat, a.branch.lng, a.hotel.lat, a.hotel.lng) || 0;
      const distBtoB = haversineKm(b.branch.lat, b.branch.lng, b.hotel.lat, b.hotel.lng) || 0;
      const distAtoB = haversineKm(a.branch.lat, a.branch.lng, b.hotel.lat, b.hotel.lng) || 0;
      const distBtoA = haversineKm(b.branch.lat, b.branch.lng, a.hotel.lat, a.hotel.lng) || 0;
      const viaAHotel = distAtoA + distBtoA; // ทั้งคู่พักที่โรงแรมของ a
      const viaBHotel = distAtoB + distBtoB; // ทั้งคู่พักที่โรงแรมของ b
      const useA = viaAHotel <= viaBHotel;
      const combinedOneWayKm = useA ? viaAHotel : viaBHotel;
      const separateOneWayKm = distAtoA + distBtoB;
      const separateCost = Math.round(separateOneWayKm * 2 * FUEL_BAHT_PER_KM);
      const combinedCost = Math.round(combinedOneWayKm * 2 * FUEL_BAHT_PER_KM);

      nearbyBranchGroup.push({
        a: brief(a), b: brief(b), branchKm: Math.round(branchKm * 10) / 10,
        suggestedHotel: useA ? a.hotel.name : b.hotel.name,
        roomsBefore: a.rooms + b.rooms, roomsAfter: roomsNeeded([...a.guests, ...b.guests]),
        fuel: { separateCost, combinedCost, savings: separateCost - combinedCost, ratePerKm: FUEL_BAHT_PER_KM },
      });
    }
  }
  res.json({ sameHotel: sameHotelGroup, nearbyBranch: nearbyBranchGroup });
});

// ---------- จัดการข้อมูล (เฉพาะผู้อนุมัติ) ----------
app.get('/api/admin/staff', requireApprover, async (req, res) => {
  const { data, error } = await supabase.from('approval_staff').select('*').order('category').order('team_code').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ staff: data });
});

app.post('/api/admin/staff', requireApprover, async (req, res) => {
  const b = req.body;
  const errors = [];
  if (!normCell(b.code)) errors.push('ต้องระบุรหัสพนักงาน');
  if (!normCell(b.name)) errors.push('ต้องระบุชื่อจริง');
  if (!normCell(b.team_code)) errors.push('ต้องระบุทีม');
  if (b.gender !== 'M' && b.gender !== 'F') errors.push('ต้องระบุเพศ');
  if (b.category !== 'activity' && b.category !== 'setup') errors.push('ต้องระบุประเภททีม (กิจกรรม/setup)');
  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const row = {
    code: normCell(b.code), name: normCell(b.name), nickname: normCell(b.nickname),
    gender: b.gender, team_code: normCell(b.team_code), category: b.category,
    role: normCell(b.role), province: normCell(b.province), phone: normCell(b.phone),
    area_owner: normCell(b.area_owner),
    home_lat: b.home_lat != null && b.home_lat !== '' ? Number(b.home_lat) : null,
    home_lng: b.home_lng != null && b.home_lng !== '' ? Number(b.home_lng) : null,
  };
  const { data, error } = await supabase.from('approval_staff').upsert(row, { onConflict: 'code,category' }).select().single();
  if (error) return res.status(500).json({ error: 'บันทึกไม่สำเร็จ: ' + error.message });
  await ref.refreshCacheOnly();
  res.status(201).json({ staff: data });
});

app.put('/api/admin/staff/:code/:category', requireApprover, async (req, res) => {
  const { code, category } = req.params;
  const b = req.body;
  const errors = [];
  if (!normCell(b.name)) errors.push('ต้องระบุชื่อจริง');
  if (!normCell(b.team_code)) errors.push('ต้องระบุทีม');
  if (b.gender !== 'M' && b.gender !== 'F') errors.push('ต้องระบุเพศ');
  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const update = {
    name: normCell(b.name), nickname: normCell(b.nickname), gender: b.gender,
    team_code: normCell(b.team_code), role: normCell(b.role), province: normCell(b.province), phone: normCell(b.phone),
    area_owner: normCell(b.area_owner),
    home_lat: b.home_lat != null && b.home_lat !== '' ? Number(b.home_lat) : null,
    home_lng: b.home_lng != null && b.home_lng !== '' ? Number(b.home_lng) : null,
  };
  const { data, error } = await supabase.from('approval_staff').update(update).eq('code', code).eq('category', category).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'บันทึกไม่สำเร็จ: ' + error.message });
  if (!data) return res.status(404).json({ error: 'ไม่พบพนักงานนี้' });
  await ref.refreshCacheOnly();
  res.json({ staff: data });
});

app.delete('/api/admin/staff/:code/:category', requireApprover, async (req, res) => {
  const { code, category } = req.params;
  const { error } = await supabase.from('approval_staff').delete().eq('code', code).eq('category', category);
  if (error) return res.status(500).json({ error: 'ลบไม่สำเร็จ: ' + error.message });
  await ref.refreshCacheOnly();
  res.json({ ok: true });
});

app.get('/api/admin/staff-sync-status', requireApprover, (req, res) => {
  res.json(ref.getStaffSyncStatus());
});
app.post('/api/admin/staff-sync-now', requireApprover, async (req, res) => {
  try {
    await ref.forceRefresh();
    res.json(ref.getStaffSyncStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/branches', requireApprover, async (req, res) => {
  const { data, error } = await supabase.from('approval_branches').select('*').order('province').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ branches: data });
});

app.post('/api/admin/import-branches', upload.single('file'), requireApprover, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัพโหลด' });
  let branches;
  try { branches = parseBranchWorkbook(req.file.buffer); } catch (err) { return res.status(400).json({ error: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); }
  if (!branches.length) return res.status(400).json({ error: 'ไม่พบข้อมูลสาขาในไฟล์นี้ (ตรวจรูปแบบคอลัมน์)' });
  const { error: delErr } = await supabase.from('approval_branches').delete().neq('code', '__none__');
  if (delErr) return res.status(500).json({ error: 'ลบข้อมูลเดิมไม่สำเร็จ: ' + delErr.message });
  for (let i = 0; i < branches.length; i += 500) {
    const { error } = await supabase.from('approval_branches').insert(branches.slice(i, i + 500));
    if (error) return res.status(500).json({ error: `นำเข้าไม่สำเร็จที่แถว ${i}: ${error.message}` });
  }
  await ref.forceRefresh();
  res.json({ ok: true, count: branches.length, active: branches.filter((b) => b.is_active).length });
});

app.get('/api/admin/hotels', requireApprover, async (req, res) => {
  const { data, error } = await supabase.from('approval_hotels').select('*').order('province').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ hotels: data });
});

// เพิ่มที่พักที่ไม่มีในทะเบียนเข้าระบบเอง (ผู้จองหรือพนักงานทำตอนกำลังเลือกที่พักในฟอร์มจอง) — ใส่แค่ชื่อ+พิกัด+ราคา
// แล้วเลือกใช้ในคำขอนี้ได้ทันที ระบบคิดระยะทางให้เหมือนที่พักในทะเบียนทุกอย่างเพราะใช้พิกัดคำนวณ haversine เหมือนกัน
// ตั้ง is_custom ไว้เพื่อกันไม่ให้ "นำเข้าที่พัก" (แทนที่ทั้งทะเบียนด้วยไฟล์ Excel) ลบรายการนี้ทิ้งไปด้วย
app.post('/api/hotels/custom', async (req, res) => {
  const { name, lat, lng, price_per_night, actor } = req.body;
  const errors = [];
  if (!String(name || '').trim()) errors.push('ต้องระบุชื่อที่พัก');
  const latNum = Number(lat), lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) errors.push('พิกัดไม่ถูกต้อง');
  const priceNum = Number(price_per_night);
  if (!Number.isFinite(priceNum) || priceNum <= 0) errors.push('ต้องระบุราคาห้อง/คืน');
  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const code = 'CUSTOM' + Date.now().toString(36).toUpperCase();
  const row = {
    code, name: String(name).trim(), lat: latNum, lng: lngNum, price_per_night: priceNum,
    map_link: `https://www.google.com/maps?q=${latNum},${lngNum}`,
    is_active: true, is_custom: true, added_by: actor || null,
  };
  const { data, error } = await supabase.from('approval_hotels').insert(row).select().single();
  if (error) return res.status(500).json({ error: 'เพิ่มที่พักไม่สำเร็จ: ' + error.message });
  await ref.refreshCacheOnly();
  res.status(201).json({ hotel: data });
});

app.post('/api/admin/import-hotels', upload.single('file'), requireApprover, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัพโหลด' });
  let hotels;
  try { hotels = parseHotelWorkbook(req.file.buffer); } catch (err) { return res.status(400).json({ error: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); }
  if (!hotels.length) return res.status(400).json({ error: 'ไม่พบข้อมูลที่พักในไฟล์นี้ (ตรวจรูปแบบคอลัมน์)' });
  // ลบเฉพาะที่พักจากทะเบียนเดิม ไม่แตะที่พักที่พนักงาน/ผู้จองเพิ่มเองระหว่างทาง (is_custom) กันหายตอนนำเข้าทับ
  const { error: delErr } = await supabase.from('approval_hotels').delete().eq('is_custom', false);
  if (delErr) return res.status(500).json({ error: 'ลบข้อมูลเดิมไม่สำเร็จ: ' + delErr.message });
  for (let i = 0; i < hotels.length; i += 500) {
    const { error } = await supabase.from('approval_hotels').insert(hotels.slice(i, i + 500));
    if (error) return res.status(500).json({ error: `นำเข้าไม่สำเร็จที่แถว ${i}: ${error.message}` });
  }
  await ref.forceRefresh();
  res.json({ ok: true, count: hotels.length });
});

app.post('/api/admin/import-schedule', upload.single('file'), requireApprover, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัพโหลด' });
  const sourceMonth = String(req.body.source_month || '').trim();
  if (!sourceMonth) return res.status(400).json({ error: 'ต้องระบุเดือนของไฟล์นี้ (เช่น 2026-09)' });
  let entries, skippedUnknownTeam;
  try {
    ({ entries, skippedUnknownTeam } = parseScheduleCsv(req.file.buffer.toString('utf8'), sourceMonth));
  } catch (err) { return res.status(400).json({ error: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); }
  if (!entries.length) return res.status(400).json({ error: 'ไม่พบข้อมูลแผนงานในไฟล์นี้ (ตรวจรูปแบบคอลัมน์)' });

  // ลบของเดิมเฉพาะเดือนนี้ที่ "ยังไม่ได้จอง" ก่อนนำเข้าใหม่ — อันที่จองไปแล้วเก็บไว้เหมือนเดิม ไม่ลบทิ้ง
  const { error: delErr } = await supabase.from('approval_schedule_entries').delete().eq('source_month', sourceMonth).is('matched_request_id', null);
  if (delErr) return res.status(500).json({ error: 'ลบข้อมูลเดิมไม่สำเร็จ: ' + delErr.message });

  for (let i = 0; i < entries.length; i += 500) {
    const { error } = await supabase.from('approval_schedule_entries').upsert(entries.slice(i, i + 500), { onConflict: 'team_code,group_key,branch_code' });
    if (error) return res.status(500).json({ error: `นำเข้าไม่สำเร็จที่แถว ${i}: ${error.message}` });
  }
  res.json({ ok: true, count: entries.length, skippedUnknownTeam });
});

const PORT = process.env.PORT || 4310;
app.listen(PORT, () => console.log(`sma-approval-console ทำงานที่ http://localhost:${PORT} (ต่อ Supabase จริงแล้ว)`));
