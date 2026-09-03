const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { supabase } = require('./lib/supabase');
const ref = require('./lib/reference-data');
const { haversineKm, roomsNeeded } = require('./lib/geo');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MISSION_TYPES = {
  activity: ['งานแฟร์', 'งานเปิดสาขาใหม่', 'ประชุม', 'สำรวจพื้นที่'],
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

app.get('/api/teams', (req, res) => {
  const category = String(req.query.category || '');
  const rows = ref.getStaff().filter((s) => !category || s.category === category);
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
  const rule = RULES[req.query.category] || RULES.activity;
  const withDist = ref.getHotels()
    .map((h) => ({ ...h, distance_km: haversineKm(branch.lat, branch.lng, h.lat, h.lng) }))
    .filter((h) => h.distance_km != null)
    .sort((a, b) => a.distance_km - b.distance_km);
  res.json({
    branch,
    near: withDist.filter((h) => h.distance_km <= rule.hotelMaxKm).slice(0, 20),
    far: withDist.filter((h) => h.distance_km > rule.hotelMaxKm).slice(0, 15),
    hotelMaxKm: rule.hotelMaxKm,
  });
});

async function getOpenBookingMap() {
  const { data, error } = await supabase
    .from('approval_request_guests')
    .select('employee_code, approval_requests!inner(status, branch_name, checkin_date, checkout_date)')
    .in('approval_requests.status', ['pending', 'approved']);
  if (error) throw new Error(error.message);
  const map = new Map();
  for (const row of data) {
    if (!row.employee_code || map.has(row.employee_code)) continue;
    const r = row.approval_requests;
    map.set(row.employee_code, { branch: r.branch_name, dates: `${r.checkin_date} – ${r.checkout_date}` });
  }
  return map;
}

app.get('/api/staff', async (req, res) => {
  const { category, team, q } = req.query;
  let rows = ref.getStaff();
  if (category) rows = rows.filter((s) => s.category === category);
  if (team) rows = rows.filter((s) => s.team_code === team);
  if (q) {
    const query = String(q).toLowerCase();
    rows = rows.filter((s) => s.name.toLowerCase().includes(query) || (s.nickname || '').toLowerCase().includes(query) || (s.team_code || '').toLowerCase().includes(query));
  }
  try {
    const openMap = await getOpenBookingMap();
    res.json({ staff: rows.slice(0, 40).map((s) => ({ ...s, openBooking: openMap.get(s.code) || null })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- requests ----------
async function computeDupWarnings(requestId, guests) {
  const warnings = [];
  for (const g of guests) {
    if (!g.employee_code) continue;
    const { data: rows } = await supabase
      .from('approval_request_guests')
      .select('request_id, approval_requests!inner(id, status, branch_name, checkin_date, checkout_date)')
      .eq('employee_code', g.employee_code)
      .neq('request_id', requestId)
      .in('approval_requests.status', ['pending', 'approved']);
    if (rows && rows.length) {
      const o = rows[0].approval_requests;
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
  const dupWarnings = await computeDupWarnings(r.id, guests);
  const creator = ref.getStaff().find((s) => s.code === r.created_by);
  return {
    ...r,
    createdByName: creator ? (creator.nickname || creator.name) : r.created_by,
    branch: { code: r.branch_code, name: r.branch_name, province: r.branch_province, lat: r.branch_lat, lng: r.branch_lng },
    hotel: r.hotel_code ? { code: r.hotel_code, name: r.hotel_name, price_per_night: r.hotel_price_per_night, map_link: r.hotel_map_link, lat: r.hotel_lat, lng: r.hotel_lng } : null,
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
  if (!b.hotel_code) errors.push('ต้องเลือกที่พัก');
  if (!b.created_by) errors.push('ไม่พบผู้สร้างคำขอ (session หมดอายุ?)');
  if (!Array.isArray(b.guests) || b.guests.length === 0) errors.push('ต้องมีผู้เข้าพักอย่างน้อย 1 คน');

  const branch = findBranch(b.branch_code);
  const hotel = findHotel(b.hotel_code);
  if (!branch) errors.push('ไม่พบสาขานี้ในข้อมูลอ้างอิง');
  if (b.hotel_code && !hotel) errors.push('ไม่พบที่พักนี้ในข้อมูลอ้างอิง');

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

  if (rule && branch && hotel) {
    const dist = haversineKm(branch.lat, branch.lng, hotel.lat, hotel.lng);
    if (dist != null && dist > rule.hotelMaxKm && !String(b.far_reason || '').trim()) {
      errors.push(`ที่พักนี้ห่างสาขา ${dist} กม. (เกิน ${rule.hotelMaxKm} กม.) ต้องระบุเหตุผลกำกับ`);
    }
  }

  // กันจองซ้ำ: ห้ามมีใครในรายชื่อที่มีคำขออื่นซึ่งยังเปิดอยู่
  if (Array.isArray(b.guests)) {
    try {
      const openMap = await getOpenBookingMap();
      for (const g of b.guests) {
        if (g.employee_code && openMap.has(g.employee_code)) {
          const o = openMap.get(g.employee_code);
          errors.push(`${g.name} มีแผนจองอยู่แล้ว (${o.branch} ${o.dates}) ไม่สามารถจองซ้ำได้`);
        }
      }
    } catch (err) { errors.push('ตรวจสอบการจองซ้ำไม่สำเร็จ: ' + err.message); }
  }

  if (errors.length) return res.status(400).json({ error: errors.join(' / ') });

  const { data: inserted, error: insErr } = await supabase.from('approval_requests').insert({
    team_category: b.team_category,
    mission_type: b.mission_type,
    team_code: b.team_code,
    branch_code: branch.code, branch_name: branch.name, branch_province: branch.province, branch_lat: branch.lat, branch_lng: branch.lng,
    checkin_date: b.checkin_date, checkout_date: b.checkout_date,
    hotel_code: hotel.code, hotel_name: hotel.name, hotel_price_per_night: hotel.price_per_night, hotel_map_link: hotel.map_link, hotel_lat: hotel.lat, hotel_lng: hotel.lng,
    muster_name: muster ? muster.muster_name : null, muster_lat: muster ? muster.lat : null, muster_lng: muster ? muster.lng : null,
    muster_reason: b.muster_reason || null,
    far_reason: b.far_reason || null,
    created_by: b.created_by,
  }).select().single();
  if (insErr) return res.status(500).json({ error: 'บันทึกคำขอไม่สำเร็จ: ' + insErr.message });

  const guestRows = b.guests.map((g) => ({ request_id: inserted.id, employee_code: g.employee_code || null, name: g.name, phone: g.phone || null, gender: g.gender || null }));
  const { error: guestErr } = await supabase.from('approval_request_guests').insert(guestRows);
  if (guestErr) return res.status(500).json({ error: 'บันทึกรายชื่อผู้เข้าพักไม่สำเร็จ: ' + guestErr.message });

  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', inserted.id).single();
  res.status(201).json({ request: await serializeRequest(full) });
});

app.get('/api/requests', async (req, res) => {
  const { actor, role, category, status } = req.query;
  let query = supabase.from('approval_requests').select('*, approval_request_guests(*)');
  if (role === 'approver' && category) query = query.eq('team_category', category).order('created_at', { ascending: true });
  else if (actor) query = query.eq('created_by', actor).order('created_at', { ascending: false });
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
  const { action, actor, reason, confirmation_no } = req.body;
  let update = null;

  if (action === 'approve') {
    if (r.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ' });
    update = { status: 'approved', approved_by: actor, approved_at: new Date().toISOString() };
  } else if (action === 'reject') {
    if (!reason) return res.status(400).json({ error: 'ต้องระบุเหตุผลตีกลับ' });
    update = { status: 'rejected', reject_reason: reason };
  } else if (action === 'confirm') {
    if (r.status !== 'approved') return res.status(400).json({ error: 'ต้องอนุมัติก่อนถึงจะกดจองสำเร็จได้' });
    if (!confirmation_no) return res.status(400).json({ error: 'ต้องใส่เลขยืนยันจากโรงแรม' });
    update = { status: 'done', confirmation_no, done_by: actor, done_at: new Date().toISOString() };
  } else {
    return res.status(400).json({ error: 'ไม่รู้จัก action นี้' });
  }

  const { error: updErr } = await supabase.from('approval_requests').update(update).eq('id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  const { data: full } = await supabase.from('approval_requests').select('*, approval_request_guests(*)').eq('id', id).single();
  res.json({ request: await serializeRequest(full) });
});

app.get('/api/analysis', async (req, res) => {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*, approval_request_guests(*)')
    .in('status', ['pending', 'approved']);
  if (error) return res.status(500).json({ error: error.message });
  const reqs = await Promise.all(data.map(serializeRequest));

  const overlaps = (a, b) => new Date(a.checkin_date) < new Date(b.checkout_date) && new Date(b.checkin_date) < new Date(a.checkout_date);
  const genderCounts = (r) => {
    const male = r.guests.filter((g) => g.gender === 'M').length;
    const female = r.guests.filter((g) => g.gender === 'F').length;
    return { oddMale: male % 2 === 1, oddFemale: female % 2 === 1 };
  };

  const suggestions = [];
  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i], b = reqs[j];
      if (!overlaps(a, b)) continue;
      const sameHotel = a.hotel_code && a.hotel_code === b.hotel_code;
      const branchKm = a.branch.lat != null && b.branch.lat != null ? haversineKm(a.branch.lat, a.branch.lng, b.branch.lat, b.branch.lng) : null;
      const nearbyBranch = !sameHotel && branchKm != null && branchKm <= 10;
      if (!sameHotel && !nearbyBranch) continue;

      const gA = genderCounts(a), gB = genderCounts(b);
      const roomShare = sameHotel && ((gA.oddMale && gB.oddMale) || (gA.oddFemale && gB.oddFemale));

      suggestions.push({
        a: { id: a.id, branch: a.branch.name, team: a.team_code, dates: `${a.checkin_date} – ${a.checkout_date}`, hotel: a.hotel?.name },
        b: { id: b.id, branch: b.branch.name, team: b.team_code, dates: `${b.checkin_date} – ${b.checkout_date}`, hotel: b.hotel?.name },
        sameHotel, nearbyBranch, branchKm, roomShare,
      });
    }
  }
  res.json({ suggestions });
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
    home_lat: b.home_lat != null && b.home_lat !== '' ? Number(b.home_lat) : null,
    home_lng: b.home_lng != null && b.home_lng !== '' ? Number(b.home_lng) : null,
  };
  const { data, error } = await supabase.from('approval_staff').upsert(row, { onConflict: 'code,category' }).select().single();
  if (error) return res.status(500).json({ error: 'บันทึกไม่สำเร็จ: ' + error.message });
  await ref.forceRefresh();
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
    home_lat: b.home_lat != null && b.home_lat !== '' ? Number(b.home_lat) : null,
    home_lng: b.home_lng != null && b.home_lng !== '' ? Number(b.home_lng) : null,
  };
  const { data, error } = await supabase.from('approval_staff').update(update).eq('code', code).eq('category', category).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'บันทึกไม่สำเร็จ: ' + error.message });
  if (!data) return res.status(404).json({ error: 'ไม่พบพนักงานนี้' });
  await ref.forceRefresh();
  res.json({ staff: data });
});

app.delete('/api/admin/staff/:code/:category', requireApprover, async (req, res) => {
  const { code, category } = req.params;
  const { error } = await supabase.from('approval_staff').delete().eq('code', code).eq('category', category);
  if (error) return res.status(500).json({ error: 'ลบไม่สำเร็จ: ' + error.message });
  await ref.forceRefresh();
  res.json({ ok: true });
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

app.post('/api/admin/import-hotels', upload.single('file'), requireApprover, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัพโหลด' });
  let hotels;
  try { hotels = parseHotelWorkbook(req.file.buffer); } catch (err) { return res.status(400).json({ error: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); }
  if (!hotels.length) return res.status(400).json({ error: 'ไม่พบข้อมูลที่พักในไฟล์นี้ (ตรวจรูปแบบคอลัมน์)' });
  const { error: delErr } = await supabase.from('approval_hotels').delete().neq('code', '__none__');
  if (delErr) return res.status(500).json({ error: 'ลบข้อมูลเดิมไม่สำเร็จ: ' + delErr.message });
  for (let i = 0; i < hotels.length; i += 500) {
    const { error } = await supabase.from('approval_hotels').insert(hotels.slice(i, i + 500));
    if (error) return res.status(500).json({ error: `นำเข้าไม่สำเร็จที่แถว ${i}: ${error.message}` });
  }
  await ref.forceRefresh();
  res.json({ ok: true, count: hotels.length });
});

const PORT = process.env.PORT || 4310;
app.listen(PORT, () => console.log(`sma-approval-console ทำงานที่ http://localhost:${PORT} (ต่อ Supabase จริงแล้ว)`));
