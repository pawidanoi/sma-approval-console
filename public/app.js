// ===== state =====
let session = null;
let currentRole = null;   // 'booker' | 'approver' | 'employee'
let approverCategory = null;
let form = {
  category: null, missionType: null, teamCode: null,
  musterPoints: [], chosenMuster: null,
  branch: null, branch2: null, musterCheck: null, hotelMaxKm: null,
  selectedHotels: [], guests: [], scheduleEntryId: null,
  roomCount: null, roomAssignments: [],
};
let guestUidSeq = 1;
let detailCtx = { backTarget: 'booker-home', readonly: false, requestId: null };

const CATEGORY_LABEL = { activity: 'ทีมกิจกรรม', setup: 'ทีม setup' };

function el(id) { return document.getElementById(id); }
function showView(id) {
  document.querySelectorAll('#content > .view').forEach((v) => v.classList.toggle('active', v.dataset.view === id));
  document.querySelectorAll('.tabbtn').forEach((t) => t.classList.toggle('on', t.dataset.view === id));
}
async function api(path, opts) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
function errBox(msg) { return `<div class="error-box">${msg}</div>`; }
// แทน confirm()/alert() ของเบราว์เซอร์ ด้วยกล่องในธีมตัวเอง — native dialog บางเบราว์เซอร์กดแล้วไม่มีผล/มองไม่เห็นชัด
function confirmDialog(msg) {
  return new Promise((resolve) => {
    el('confirmModalMsg').textContent = msg;
    el('confirmModal').style.display = 'flex';
    const cleanup = (result) => { el('confirmModal').style.display = 'none'; okBtn.onclick = null; cancelBtn.onclick = null; resolve(result); };
    const okBtn = el('confirmModalOk'), cancelBtn = el('confirmModalCancel');
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
  });
}
function alertDialog(msg) {
  return new Promise((resolve) => {
    el('alertModalMsg').textContent = msg;
    el('alertModal').style.display = 'flex';
    const okBtn = el('alertModalOk');
    okBtn.onclick = () => { el('alertModal').style.display = 'none'; okBtn.onclick = null; resolve(); };
  });
}
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => flashCopied(btn)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    flashCopied(btn);
  });
}
function flashCopied(btn) { if (!btn) return; const old = btn.textContent; btn.textContent = '✓'; setTimeout(() => (btn.textContent = old), 1200); }
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

// ===== authored icon set — bold-outline flat "sticker" style, no emoji glyphs =====
// each icon: a rounded-square (or, for pin, a teardrop) badge in one saturated hue,
// a heavy black outline, and a simple white pictogram inside.
const ICON_DEFS = {
  search: { bg: 'var(--info)', glyph: '<circle cx="41" cy="41" r="16" fill="none" stroke="#fff" stroke-width="8"/><line x1="53" y1="53" x2="72" y2="72" stroke="#fff" stroke-width="9" stroke-linecap="round"/>' },
  users: { bg: 'var(--accent)', glyph: '<circle cx="37" cy="36" r="10" fill="#fff"/><path d="M18 68c0-13 9-21 19-21s19 8 19 21" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="67" cy="41" r="7.5" fill="#fff" opacity=".8"/><path d="M60 68c1-10 7-16 14-17" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>' },
  clock: { bg: 'var(--warning)', glyph: '<circle cx="50" cy="48" r="23" fill="none" stroke="#fff" stroke-width="8"/><line x1="50" y1="48" x2="50" y2="32" stroke="#fff" stroke-width="7" stroke-linecap="round"/><line x1="50" y1="48" x2="62" y2="56" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' },
  check: { bg: 'var(--success)', glyph: '<polyline points="30,52 44,66 72,34" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' },
  alert: { bg: 'var(--warning)', glyph: '<path d="M50 24 L78 68 L22 68 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><line x1="50" y1="42" x2="50" y2="56" stroke="#fff" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="63" r="3.6" fill="#fff"/>' },
  x: { bg: 'var(--danger)', glyph: '<line x1="34" y1="34" x2="66" y2="66" stroke="#fff" stroke-width="10" stroke-linecap="round"/><line x1="66" y1="34" x2="34" y2="66" stroke="#fff" stroke-width="10" stroke-linecap="round"/>' },
  hotel: { bg: 'var(--accent)', glyph: '<rect x="30" y="32" width="40" height="38" rx="4" fill="#fff"/><path d="M26 32 50 16 74 32" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="43" y="54" width="14" height="16" fill="var(--accent)"/><rect x="35" y="40" width="8" height="8" rx="1.5" fill="var(--accent)"/><rect x="57" y="40" width="8" height="8" rx="1.5" fill="var(--accent)"/>' },
  briefcase: { bg: 'var(--info)', glyph: '<path d="M40 34v-4a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v4" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="34" width="52" height="36" rx="6" fill="#fff"/><rect x="24" y="34" width="52" height="36" rx="6" fill="none" stroke="var(--info)" stroke-width="0"/><rect x="44" y="48" width="12" height="10" rx="2" fill="var(--info)"/>' },
  calendar: { bg: 'var(--danger)', glyph: '<rect x="26" y="30" width="48" height="42" rx="6" fill="#fff"/><rect x="26" y="30" width="48" height="14" rx="6" fill="var(--danger)"/><rect x="36" y="20" width="7" height="16" rx="3.5" fill="#fff"/><rect x="57" y="20" width="7" height="16" rx="3.5" fill="#fff"/><circle cx="38" cy="58" r="4" fill="var(--danger)"/><circle cx="50" cy="58" r="4" fill="var(--danger)"/><circle cx="62" cy="58" r="4" fill="var(--danger)"/>' },
  copy: { bg: 'var(--accent)', glyph: '<rect x="24" y="24" width="38" height="38" rx="6" fill="#fff" opacity=".55"/><rect x="38" y="38" width="38" height="38" rx="6" fill="#fff"/>' },
  package: { bg: 'var(--warning)', glyph: '<path d="M50 20 76 34v32 L50 80 24 66V34 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M24 34 50 48 76 34" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><line x1="50" y1="48" x2="50" y2="80" stroke="#fff" stroke-width="7"/>' },
  bed: { bg: 'var(--info)', glyph: '<path d="M20 70V50a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v20" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 58V44a5 5 0 0 1 5-5h16a5 5 0 0 1 5 5v10" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="76" x2="84" y2="76" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' },
  undo: { bg: 'var(--danger)', glyph: '<path d="M64 34c11 4 17 15 13 26-4 10-16 16-27 12" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><polyline points="42,26 26,34 36,50" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' },
  moon: { bg: 'var(--info)', glyph: '<path d="M63 26a24 24 0 1 0 11 39 19 19 0 0 1-11-39z" fill="#fff"/>' },
  home: { bg: 'var(--success)', glyph: '<path d="M24 46 50 24 76 46v28a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4z" fill="#fff"/><rect x="43" y="52" width="14" height="22" fill="var(--success)"/>' },
};
function iconSvgInner(name) {
  if (name === 'pin') {
    return `<path d="M50 8c17 0 30 13 30 30 0 22-30 54-30 54S20 60 20 38C20 21 33 8 50 8z" fill="var(--danger)" stroke="var(--ink)" stroke-width="7" stroke-linejoin="round"/><circle cx="50" cy="39" r="13" fill="#fff" stroke="var(--ink)" stroke-width="5"/>`;
  }
  const def = ICON_DEFS[name] || ICON_DEFS.x;
  return `<rect x="6" y="6" width="88" height="88" rx="26" fill="${def.bg}" stroke="var(--ink)" stroke-width="7"/>${def.glyph}`;
}
function icon(name, size) {
  const s = size || 22;
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" class="ic-svg" style="overflow:visible; flex:0 0 auto;">${iconSvgInner(name)}</svg>`;
}
const EMPTY_ILLUSTRATIONS = {
  suitcase: `<svg viewBox="0 0 160 120" width="130" height="98" fill="none">
    <path d="M8 108c20-46 46-70 72-70s52 24 72 70" fill="none" stroke="var(--info)" stroke-width="7" stroke-linecap="round" opacity=".35"/>
    <circle cx="128" cy="26" r="15" fill="var(--warning)" stroke="var(--ink)" stroke-width="5"/>
    <rect x="38" y="46" width="84" height="56" rx="10" fill="var(--accent)" stroke="var(--ink)" stroke-width="6"/>
    <rect x="38" y="46" width="84" height="16" fill="var(--accent-deep)" opacity=".4"/>
    <rect x="62" y="32" width="36" height="18" rx="6" fill="var(--accent-deep)" stroke="var(--ink)" stroke-width="6"/>
    <rect x="52" y="70" width="20" height="8" rx="4" fill="#fff" stroke="var(--ink)" stroke-width="4"/>
    <circle cx="52" cy="104" r="7" fill="var(--ink)"/>
    <circle cx="108" cy="104" r="7" fill="var(--ink)"/>
  </svg>`,
  allDone: `<svg viewBox="0 0 160 120" width="130" height="98" fill="none">
    <circle cx="80" cy="56" r="42" fill="var(--success)" stroke="var(--ink)" stroke-width="7"/>
    <polyline points="58,56 72,70 104,38" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 22l5 10 10 5-10 5-5 10-5-10-10-5 10-5z" fill="var(--warning)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="136" cy="30" r="6" fill="var(--accent)" stroke="var(--ink)" stroke-width="3.5"/>
    <circle cx="138" cy="78" r="5" fill="var(--info)" stroke="var(--ink)" stroke-width="3.5"/>
  </svg>`,
  search: `<svg viewBox="0 0 160 120" width="120" height="90" fill="none">
    <rect x="42" y="26" width="76" height="58" rx="14" fill="var(--surface-2)" stroke="var(--ink)" stroke-width="6"/>
    <circle cx="70" cy="52" r="15" fill="none" stroke="var(--info)" stroke-width="7"/>
    <line x1="81" y1="63" x2="93" y2="75" stroke="var(--info)" stroke-width="7" stroke-linecap="round"/>
  </svg>`,
};
function emptyStateHtml(kind, title, subtitle) {
  return `<div class="empty-state">${EMPTY_ILLUSTRATIONS[kind] || EMPTY_ILLUSTRATIONS.search}<b>${title}</b>${subtitle ? `<span>${subtitle}</span>` : ''}</div>`;
}

const AV_COLORS = [['#FF6A3D','#E14F22'], ['#2FB24A','#1E8536'], ['#2CA6D8','#1C7CA3'], ['#F0453B','#C62E27'], ['#FFC22B','#C6890A']];
const GENDER_COLORS = { M: '#2CA6D8', F: '#FF5C8A' };
const GENDER_RANK = { M: 0, F: 1 };
// สี AREA คงที่ 4 สี ไม่ซ้ำกัน — ให้จำผู้จองแต่ละคนได้ทันทีจากสีเดียวกันทุกที่ในระบบ
const AREA_COLORS = { 'ติ': '#7C4DFF', 'อิ๋ม': '#FF3D81', 'เมา': '#00B8A9', 'หนุ่ย': '#FF9800' };
function bareNickname(name) { return (name || '').trim().replace(/^(พี่|คุณ|นางสาว|นาย|นาง)/, '').trim(); }
function sortByGender(guests) {
  return guests.map((g, i) => [g, i]).sort((a, b) => (GENDER_RANK[a[0].gender] ?? 2) - (GENDER_RANK[b[0].gender] ?? 2) || a[1] - b[1]).map((pair) => pair[0]);
}
function avatarPair(seed) { let h = 0; for (const c of String(seed || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function avatarHtml(name, size, gender) {
  const initial = (name || '?').trim()[0] || '?';
  const c1 = AREA_COLORS[bareNickname(name)] || GENDER_COLORS[gender] || avatarPair(name)[0];
  const s = size || 32;
  return `<div class="avatar" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px;background:${c1};">${initial}</div>`;
}

// ===== login / role =====
async function doLogin() {
  const code = el('loginCode').value.trim();
  el('loginError').innerHTML = '';
  if (!code) return;
  try {
    session = await api('/api/session?code=' + encodeURIComponent(code));
    renderRolePick();
    showView('role-pick');
  } catch (e) {
    el('loginError').innerHTML = errBox(e.message);
  }
}
function renderRolePick() {
  const emp = session.employee;
  el('rpAv').outerHTML = avatarHtml(emp.nickname || emp.name, 56, emp.gender).replace('class="avatar"', 'class="avatar" id="rpAv"');
  el('rpGreeting').textContent = 'สวัสดีคุณ' + (emp.nickname || emp.name);
  el('rolePickList').innerHTML = session.roleOptions.map((r) => `
    <button class="role-btn" onclick='selectRole(${JSON.stringify(r.role)}, ${JSON.stringify(r.category)})'>
      <b>${r.label}</b><span>${r.role === 'booker' ? 'สร้างคำขอจองที่พักแทนพนักงาน' : r.role === 'approver' ? 'อนุมัติคำขอในสายนี้' : 'ค้นหาแผนของตัวเอง'}</span>
    </button>`).join('');
}
function selectRole(role, category) {
  currentRole = role;
  approverCategory = category;
  const emp = session.employee;
  el('whoBox').style.visibility = 'visible';
  el('whoAv').outerHTML = avatarHtml(emp.nickname || emp.name, 32, emp.gender).replace('class="avatar"', 'class="avatar" id="whoAv"');
  el('whoName').textContent = emp.nickname || emp.name;
  el('whoRole').textContent = role === 'approver' ? 'ผู้อนุมัติ · ' + CATEGORY_LABEL[category] : role === 'booker' ? 'ผู้จอง' : 'พนักงาน';
  const tabs = { booker: [['booker-home', 'แผนของฉัน'], ['schedule-to-book', 'แผนงานที่ต้องจอง'], ['booker-form', 'สร้างคำขอจอง'], ['booker-vacancy', 'ห้องว่าง'], ['hotel-reviews', 'รีวิวที่พัก']], approver: [['approver-queue', 'คิวรออนุมัติ'], ['schedule-all', 'แผนงานทั้งหมด'], ['booker-vacancy', 'ห้องว่าง'], ['analysis', 'วิเคราะห์รวม'], ['dashboard', 'แดชบอร์ด'], ['hotel-reviews', 'รีวิวที่พัก'], ['admin-data', 'จัดการข้อมูล']], employee: [['employee-view', 'ค้นหาแผน'], ['hotel-reviews', 'รีวิวที่พัก']] };
  const tb = el('tabbar'); tb.innerHTML = '';
  tabs[role].forEach(([id, label], i) => {
    const b = document.createElement('button');
    b.className = 'tabbtn' + (i === 0 ? ' on' : '');
    b.textContent = label; b.dataset.view = id;
    b.onclick = () => { showView(id); if (id === 'booker-home') loadBookerHome(); if (id === 'approver-queue') loadApproverQueue(); if (id === 'dashboard') loadDashboard(); if (id === 'analysis') loadAnalysis(); if (id === 'admin-data') loadAdminData(); if (id === 'booker-vacancy') loadVacancyList(); if (id === 'hotel-reviews') openHotelReviewList(); if (id === 'employee-view') loadEmployeeView(); if (id === 'schedule-to-book') loadScheduleToBook(); if (id === 'schedule-all') loadScheduleAll(); };
    tb.appendChild(b);
  });
  showView(tabs[role][0][0]);
  if (role === 'booker') loadBookerHome();
  if (role === 'approver') loadApproverQueue();
  if (role === 'employee') loadEmployeeView();
}
function logout() {
  session = null; currentRole = null; approverCategory = null;
  el('whoBox').style.visibility = 'hidden'; el('tabbar').innerHTML = ''; el('loginCode').value = '';
  showView('login');
}

// ===== booker home =====
const STATUS_LABEL = {
  pending: ['รอ AREA จองที่พัก', 'pill-warning'], booked: ['จองแล้ว รอเจ้าของทีมอนุมัติ', 'pill-accent'],
  approved: ['อนุมัติแล้ว รอ AREA ยืนยันปิดงาน', 'pill-success'],
  done: ['จองสำเร็จ', 'pill-success'], rejected: ['ตีกลับ', 'pill-danger'],
};
let bookerAllReqs = [];
let bookerShowArchive = false;
let bookerStatusFilter = null;
async function loadBookerHome() {
  // ผู้จอง (AREA) เห็นคำขอทุกอันของทีมที่ตัวเองดูแล (รวมที่พนักงานจองเอง) — พนักงานเห็นแค่ของตัวเอง (ไม่ส่ง role=booker)
  const params = new URLSearchParams({ actor: session.employee.code });
  if (currentRole === 'booker') { params.set('role', 'booker'); params.set('category', bookerCategory()); }
  const data = await api('/api/requests?' + params.toString());
  bookerAllReqs = data.requests;
  bookerShowArchive = false;
  bookerStatusFilter = null;
  renderBookerList();
}
function toggleBookerArchive() { bookerShowArchive = !bookerShowArchive; bookerStatusFilter = null; renderBookerList(); }
function filterBookerByStatus(status) { bookerStatusFilter = bookerStatusFilter === status ? null : status; renderBookerList(); }
function renderBookerList() {
  const reqs = bookerAllReqs;
  const counts = { pending: 0, booked: 0, approved: 0, done: 0, rejected: 0 };
  reqs.forEach((r) => counts[r.status]++);
  const tile = (status, iconName, label) => `<div class="snap" style="cursor:pointer; ${bookerStatusFilter === status ? 'border-color:var(--accent); box-shadow:var(--shadow);' : ''}" onclick="filterBookerByStatus('${status}')"><div class="ic">${icon(iconName, 20)}</div><div class="tx"><b class="num">${counts[status]}</b><span>${label}</span></div></div>`;
  el('bookerStats').innerHTML =
    tile('pending', 'clock', 'รอ AREA จอง') + tile('booked', 'package', 'จองแล้ว รอเจ้าของทีมอนุมัติ') + tile('approved', 'package', 'อนุมัติแล้ว รอ AREA ยืนยันปิดงาน') +
    tile('done', 'check', 'จองสำเร็จ') + tile('rejected', 'undo', 'ถูกตีกลับ');

  let shown, emptyKind, emptyTitle, emptySub;
  if (bookerStatusFilter) {
    shown = reqs.filter((r) => r.status === bookerStatusFilter);
    el('bookerArchiveToggle').innerHTML = `<button class="btn btn-ghost btn-sm" onclick="filterBookerByStatus('${bookerStatusFilter}')">‹ ล้างตัวกรอง แสดงทั้งหมด</button>`;
    emptyKind = 'search'; emptyTitle = 'ไม่พบรายการในสถานะนี้'; emptySub = '';
  } else {
    const active = reqs.filter((r) => r.status === 'pending' || r.status === 'booked' || r.status === 'approved');
    const archived = reqs.filter((r) => r.status === 'done' || r.status === 'rejected');
    shown = bookerShowArchive ? archived : active;
    el('bookerArchiveToggle').innerHTML = bookerShowArchive
      ? `<button class="btn btn-ghost btn-sm" onclick="toggleBookerArchive()">‹ กลับไปรายการที่กำลังดำเนินการ</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="toggleBookerArchive()">${icon('package', 14)} ดูรายการที่จบแล้ว (${archived.length})</button>`;
    emptyKind = bookerShowArchive ? 'search' : 'suitcase';
    emptyTitle = bookerShowArchive ? 'ยังไม่มีรายการที่จบแล้ว' : 'ไม่มีคำขอที่กำลังดำเนินการ';
    emptySub = bookerShowArchive ? 'คำขอที่จองสำเร็จหรือถูกตีกลับจะมาอยู่ที่นี่' : (reqs.length ? 'ดูรายการที่จบแล้วได้ที่ปุ่มด้านบน' : 'กด "สร้างคำขอจอง" เพื่อเริ่มรายการแรกของคุณ');
  }
  el('bookerReqList').innerHTML = shown.length
    ? '<div class="req-grid">' + shown.map(bookerCardHtml).join('') + '</div>'
    : emptyStateHtml(emptyKind, emptyTitle, emptySub);
}
function bookerCardHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  return `<div class="trav-card" onclick="openDetail(${r.id}, 'booker-home', false)">
    <div class="trav-top">${avatarHtml(r.team_code || r.branch?.name, 36)}<div class="info"><h3>${r.branch?.name || r.branch_code}</h3><div class="sub">${r.branch?.province || ''} · ${r.team_code || ''}</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${r.checkin_date} – ${r.checkout_date}</b></span><span class="dot"></span><span>${icon('moon', 14)} ${r.nights} คืน</span><span class="dot"></span><span>${icon('users', 14)} ${r.guests.length} คน · ${r.rooms} ห้อง</span></div>
    <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('hotel', 14)} <b>${r.hotel?.name || '-'}</b>${r.status === 'rejected' && r.reject_reason ? ' · เหตุผล: ' + r.reject_reason : ''}${r.status === 'done' && r.confirmation_no ? ' · เลข ' + r.confirmation_no : ''}</div>
  </div>`;
}

// ===== ห้องว่าง (จองสำเร็จแล้ว มีห้องว่างเหลือ) — เพิ่มผู้เข้าพักเข้าห้องเดิมได้เลย ไม่ต้องจองใหม่
// ผู้จองเห็นเฉพาะทีมของตัวเอง ส่วนผู้อนุมัติเห็นตามหมวดที่ตัวเองดูแล (activity/setup) ไม่ใช่ค่า default ของผู้จอง =====
function bookerCategory() {
  return session.roleOptions.filter((r) => r.role === 'booker').map((r) => r.category)[0] || 'activity';
}
function vacancyCategory() { return currentRole === 'approver' ? approverCategory : bookerCategory(); }
function backFromVacancy() { showView(currentRole === 'approver' ? 'approver-queue' : 'booker-home'); }
function backFromBookerForm() { showView(currentRole === 'employee' ? 'employee-view' : 'booker-home'); }
let vacancyReqs = [];
async function loadVacancyList() {
  const data = await api('/api/vacancies?category=' + encodeURIComponent(vacancyCategory()));
  vacancyReqs = data.vacancies;
  renderVacancyList();
}
function renderVacancyList() {
  el('vacancyList').innerHTML = vacancyReqs.length
    ? '<div class="req-grid">' + vacancyReqs.map(vacancyCardHtml).join('') + '</div>'
    : emptyStateHtml('suitcase', 'ไม่มีห้องว่างตอนนี้', 'รายการที่จองแล้ว อนุมัติแล้ว หรือสำเร็จแล้ว และมีห้องว่างเหลือจะมาอยู่ที่นี่');
}
function vacancyCardHtml(r) {
  const genderLabel = r.spareGender === 'M' ? 'ชาย' : 'หญิง';
  return `<div class="trav-card">
    <div class="trav-top">${avatarHtml(r.createdByName || r.team_code, 36)}<div class="info"><h3>${r.branch?.name || r.branch_code}</h3><div class="sub">${r.team_code || ''} · จองโดย ${r.createdByName}</div></div><span class="pill ${r.inStay ? 'pill-accent' : 'pill-success'}">${r.inStay ? 'กำลังเข้าพัก' : 'ยังไม่เช็คอิน'}</span></div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${r.checkin_date} – ${r.checkout_date}</b></span><span class="dot"></span><span>${icon('hotel', 14)} ${r.hotel?.name || '-'}</span></div>
    <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('users', 14)} ชาย ${r.maleCount} · หญิง ${r.femaleCount}<span class="dot"></span><span style="color:var(--success-deep); font-weight:700;">เหลือห้องว่าง 1 ที่ (${genderLabel})</span></div>
    <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="openAddGuest(${r.id})">${icon('users', 14)} ขอเพิ่มผู้เข้าพัก</button>
  </div>`;
}

let addGuestCtx = { requestId: null, request: null, guests: [] };
function isAddGuestSelected(code) {
  return (addGuestCtx.request?.guests || []).some((g) => g.employee_code === code) || addGuestCtx.guests.some((g) => g.employee_code === code);
}
function openAddGuest(id) {
  const r = vacancyReqs.find((v) => v.id === id);
  if (!r) return;
  addGuestCtx = { requestId: id, request: r, guests: [] };
  el('addGuestError').innerHTML = '';
  el('addGuestSubtitle').textContent = `${r.branch?.name || ''} · ${r.checkin_date} – ${r.checkout_date} · เพศที่ว่าง: ${r.spareGender === 'M' ? 'ชาย' : 'หญิง'}`;
  el('addGuestSearch').value = ''; el('addGuestAcList').innerHTML = ''; el('addGuestAcList').style.display = 'none';
  el('addGuestNewForm').style.display = 'none';
  renderAddGuestChips();
  showView('add-guest');
}
async function searchAddGuest(q) {
  const r = addGuestCtx.request;
  const params = new URLSearchParams({ category: vacancyCategory(), q: q || '', checkin: r?.checkin_date || '', checkout: r?.checkout_date || '' });
  const data = await api('/api/staff?' + params.toString());
  const rows = data.staff.filter((s) => !isAddGuestSelected(s.code));
  const listEl = el('addGuestAcList');
  if (!rows.length) { listEl.innerHTML = '<div class="combo-empty">ไม่พบพนักงาน</div>'; listEl.style.display = 'block'; return; }
  listEl.innerHTML = rows.map((s) => {
    const blocked = !!s.openBooking;
    return `<div class="combo-item ${blocked ? 'staff-blocked' : ''}" ${blocked ? '' : `onclick='addGuestFromStaffToAddCtx(${JSON.stringify(s)})'`}>
      <span>${s.name} (${s.nickname || s.team_code || '-'})</span>
      <span class="meta">${blocked ? 'มีแผนจองแล้ว (' + s.openBooking.branch + ' ' + s.openBooking.dates + ')' : s.team_code || ''}</span>
    </div>`;
  }).join('');
  listEl.style.display = 'block';
}
function addGuestFromStaffToAddCtx(staff) {
  if (isAddGuestSelected(staff.code) || staff.openBooking) return;
  addGuestCtx.guests.push({ employee_code: staff.code, name: staff.name, phone: staff.phone, gender: staff.gender, nickname: staff.nickname });
  el('addGuestSearch').value = ''; el('addGuestAcList').style.display = 'none';
  renderAddGuestChips();
}
function removeAddGuest(idx) { addGuestCtx.guests.splice(idx, 1); renderAddGuestChips(); }
function showAddGuestNewForm() { el('addGuestNewForm').style.display = 'flex'; }
function addNewAddGuest() {
  const name = el('addGuestNewName').value.trim();
  if (!name) return;
  addGuestCtx.guests.push({ employee_code: el('addGuestNewCode').value.trim() || null, name, gender: el('addGuestNewGender').value });
  el('addGuestNewCode').value = ''; el('addGuestNewName').value = ''; el('addGuestNewForm').style.display = 'none';
  renderAddGuestChips();
}
function renderAddGuestChips() {
  el('addGuestChipRow').innerHTML = addGuestCtx.guests.map((g, i) => `
    <div class="guest-chip">${avatarHtml(g.name, 22, g.gender)}${g.name}${g.nickname ? ' (' + g.nickname + ')' : ''}${!g.employee_code ? ' <span class="new-tag">ใหม่</span>' : ''}<span class="x" onclick="removeAddGuest(${i})">${icon('x', 12)}</span></div>`
  ).join('');
}
async function submitAddGuests() {
  el('addGuestError').innerHTML = '';
  if (!addGuestCtx.guests.length) { el('addGuestError').innerHTML = errBox('ต้องเลือกผู้เข้าพักที่จะเพิ่มอย่างน้อย 1 คน'); return; }
  try {
    el('addGuestSubmitBtn').disabled = true;
    await api(`/api/requests/${addGuestCtx.requestId}/add-guests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: session.employee.code, guests: addGuestCtx.guests }) });
    showView('booker-vacancy'); loadVacancyList();
  } catch (e) {
    el('addGuestError').innerHTML = errBox(e.message);
  } finally {
    el('addGuestSubmitBtn').disabled = false;
  }
}

// ===== booker: แผนงานที่ต้องจอง (นำเข้าจากแผนงาน NSA — เห็นเฉพาะทีมที่ดูแล กด "จองเลย" แล้วฟอร์มจองเติมให้อัตโนมัติ) =====
let scheduleItems = [];
async function loadScheduleToBook() {
  const data = await api('/api/schedule-to-book?actor=' + encodeURIComponent(session.employee.code));
  scheduleItems = data.items;
  renderScheduleToBook();
}
function renderScheduleToBook() {
  el('scheduleToBookList').innerHTML = scheduleItems.length
    ? '<div class="req-grid">' + scheduleItems.map(scheduleItemHtml).join('') + '</div>'
    : emptyStateHtml('allDone', 'ไม่มีแผนงานที่ต้องจองตอนนี้', 'รายการจากแผนงานที่ยังไม่ได้จองจะมาอยู่ที่นี่');
}
function scheduleItemHtml(it) {
  return `<div class="trav-card">
    <div class="trav-top">${avatarHtml(it.team_code, 36)}<div class="info"><h3>${it.branch?.name || '-'}${it.paired_branch ? ' + ' + it.paired_branch.name : ''}</h3><div class="sub">${it.team_code} · ${it.mission_type || '-'}</div></div>${it.paired_branch ? '<span class="pill pill-warning">ทีมย่อย 2 สาขา</span>' : ''}</div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${it.suggested_checkin} – ${it.suggested_checkout}</b></span></div>
    <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick='bookFromSchedule(${JSON.stringify(it)})'>${icon('check', 14)} จองเลย</button>
  </div>`;
}
async function bookFromSchedule(item) {
  showView('booker-form'); resetForm();
  form.scheduleEntryId = item.id;
  form.category = 'activity';
  const seg = el('teamCatSeg');
  if (seg.querySelector('.seg[data-val]')) seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.val === 'activity'));
  await loadMissionGrid();
  if (item.mission_type) {
    form.missionType = item.mission_type;
    document.querySelectorAll('#missionGrid .mission-btn').forEach((b) => b.classList.toggle('on', b.textContent === item.mission_type));
  }
  await chooseTeam(item.team_code);
  form.branch2 = item.paired_branch || null;
  form.branch = item.branch;
  el('fBranchChosen').innerHTML = `<div class="pill pill-accent" style="font-size:12.5px; padding:8px 12px;">${icon('pin', 14)} ${item.branch.name} · ${item.branch.province || ''} <span style="cursor:pointer; margin-left:6px; display:inline-flex;" onclick="clearBranch()">${icon('x', 13)}</span></div>`;
  await runMusterCheck();
  el('fCheckin').value = item.suggested_checkin;
  el('fCheckout').value = item.suggested_checkout;
  checkDatesReady();
}

// ===== ผู้อนุมัติ: แผนงานทั้งหมด (จองแล้ว/ยังไม่จอง) + เตือน Area ให้มาจอง =====
let scheduleAllItems = [];
async function loadScheduleAll() {
  const data = await api('/api/schedule-all?category=' + approverCategory);
  scheduleAllItems = data.items;
  renderScheduleAll();
}
function renderScheduleAll() {
  el('scheduleAllList').innerHTML = scheduleAllItems.length
    ? '<div class="req-grid">' + scheduleAllItems.map(scheduleAllItemHtml).join('') + '</div>'
    : emptyStateHtml('allDone', 'ไม่มีแผนงานอยู่ในระบบตอนนี้', '');
}
function scheduleAllItemHtml(it) {
  const statusPill = it.matched
    ? `<span class="pill ${STATUS_LABEL[it.matched.status][1]}">${STATUS_LABEL[it.matched.status][0]}</span>`
    : `<span class="pill pill-danger">ยังไม่จอง</span>`;
  return `<div class="trav-card" style="cursor:default;">
    <div class="trav-top">${avatarHtml(it.team_code, 36)}<div class="info"><h3>${it.branch?.name || '-'}${it.paired_branch ? ' + ' + it.paired_branch.name : ''}</h3><div class="sub">${it.team_code} · ${it.mission_type || '-'}${it.area_owner ? ' · ผู้จอง: ' + (it.area_owner.nickname || it.area_owner.code) : ' · ยังไม่ได้ตั้ง Area ดูแล'}</div></div>${statusPill}</div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${it.suggested_checkin} – ${it.suggested_checkout}</b></span>${it.matched?.hotel_name ? `<span class="dot"></span><span>${icon('hotel', 14)} ${it.matched.hotel_name}</span>` : ''}</div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      ${!it.matched ? `<button class="btn btn-primary btn-sm" id="remind-${it.id}" onclick="remindScheduleEntry(${it.id})">${icon('alert', 14)} เตือน Area ให้มาจอง</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteScheduleEntry(${it.id})">${icon('undo', 14)} ลบรายการนี้</button>
    </div>
  </div>`;
}
async function deleteScheduleEntry(id) {
  if (!(await confirmDialog('ลบแผนงานรายการนี้ออกจากระบบ?'))) return;
  try {
    await api(`/api/schedule-entries/${id}?actor=${encodeURIComponent(session.employee.code)}`, { method: 'DELETE' });
    loadScheduleAll();
  } catch (e) {
    alertDialog(e.message);
  }
}
async function remindScheduleEntry(id) {
  const btn = el('remind-' + id);
  btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  try {
    const data = await api(`/api/schedule-entries/${id}/remind?actor=${encodeURIComponent(session.employee.code)}`, { method: 'POST' });
    btn.textContent = data.sent ? '✓ เตือนแล้ว' : 'ส่งไม่สำเร็จ: ' + (data.reason || '');
    if (!data.sent) btn.disabled = false;
  } catch (e) {
    btn.textContent = 'ส่งไม่สำเร็จ'; btn.disabled = false;
  }
}

// ===== พนักงาน: แผนงานทีมตัวเอง (อันไหนจองแล้วพักที่ไหน อันไหนยังไม่จอง) =====
async function loadEmployeeSchedule() {
  try {
    const data = await api('/api/schedule-mine?code=' + encodeURIComponent(session.employee.code));
    el('empScheduleResult').innerHTML = data.items.length
      ? '<div class="req-grid">' + data.items.map(scheduleMineItemHtml).join('') + '</div>'
      : '<p class="empty-hint">ทีมคุณยังไม่มีแผนงานนำเข้าในระบบ</p>';
  } catch (e) {
    el('empScheduleResult').innerHTML = errBox(e.message);
  }
}
function scheduleMineItemHtml(it) {
  const statusPill = it.matched
    ? `<span class="pill ${STATUS_LABEL[it.matched.status][1]}">${STATUS_LABEL[it.matched.status][0]}</span>`
    : `<span class="pill pill-danger">ยังไม่จอง</span>`;
  return `<div class="trav-card" style="cursor:default;">
    <div class="trav-top"><div class="info"><h3>${it.branch?.name || '-'}${it.paired_branch ? ' + ' + it.paired_branch.name : ''}</h3><div class="sub">${it.mission_type || '-'}</div></div>${statusPill}</div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${it.suggested_checkin} – ${it.suggested_checkout}</b></span>${it.matched?.hotel_name ? `<span class="dot"></span><span>${icon('hotel', 14)} ${it.matched.hotel_name}</span>` : ''}</div>
    ${!it.matched ? `<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick='bookFromSchedule(${JSON.stringify(it)})'>${icon('check', 14)} จองเลย</button>` : ''}
  </div>`;
}

// ===== booker form =====
function resetForm() {
  form = { category: null, missionType: null, teamCode: null, musterPoints: [], chosenMuster: null, branch: null, branch2: null, musterCheck: null, hotelMaxKm: null, selectedHotels: [], guests: [], scheduleEntryId: null, roomCount: null, roomAssignments: [] };
  el('formError').innerHTML = ''; el('hotelChipRow').innerHTML = ''; el('hotelPickError').textContent = '';
  el('fBranchSearch').value = ''; el('fBranchChosen').innerHTML = '';
  el('fCheckin').value = ''; el('fCheckout').value = '';
  el('teamChosen').innerHTML = '<span style="color:var(--ink-faint); font-weight:500;">เลือกทีม...</span>';
  el('musterPointBox').innerHTML = ''; el('musterCheckBox').innerHTML = '';
  el('guestSearch').value = ''; el('guestChipRow').innerHTML = '';
  el('otherTeamBox').style.display = 'none'; el('teamRosterList').style.display = 'none'; el('guestAcList').style.display = 'none';
  el('newGuestCode').value = ''; el('newGuestName').value = ''; el('addGuestForm').style.display = 'none';
  ['branchStepCard', 'hotelStepCard', 'dateStepCard', 'guestStepCard'].forEach((id) => (el(id).style.display = 'none'));
  el('nearHotelsList').innerHTML = ''; el('farHotelsList').innerHTML = ''; el('farHotelsList').style.display = 'none';
  el('farReasonBox').style.display = 'none'; el('fFarReason').value = ''; el('distanceMapBox').innerHTML = '';
  el('newHotelName').value = ''; el('newHotelCoords').value = ''; el('newHotelPrice').value = ''; el('addHotelForm').style.display = 'none'; el('addHotelError').innerHTML = '';

  const bookerCats = session.roleOptions.filter((r) => r.role === 'booker').map((r) => r.category);
  const seg = el('teamCatSeg');
  if (bookerCats.length <= 1) {
    // พนักงานที่จองเอง (ไม่มีบทบาทผู้จอง) ให้ยึดหมวดทีมของตัวเองแทน ไม่ใช่ default 'activity' เสมอ
    form.category = bookerCats[0] || session.employee.category || 'activity';
    seg.innerHTML = `<div class="seg locked">${CATEGORY_LABEL[form.category]}</div>`;
  } else {
    seg.innerHTML = bookerCats.map((c, i) => `<div class="seg ${i === 0 ? 'on' : ''}" data-val="${c}" onclick="selectCategory('${c}')">${CATEGORY_LABEL[c]}</div>`).join('');
    form.category = bookerCats[0];
  }
  loadMissionGrid();
}
function selectCategory(cat) {
  form.category = cat;
  document.querySelectorAll('#teamCatSeg .seg').forEach((s) => s.classList.toggle('on', s.dataset.val === cat));
  form.missionType = null; form.teamCode = null;
  loadMissionGrid();
}
async function loadMissionGrid() {
  const data = await api('/api/mission-types?category=' + form.category);
  el('missionGrid').innerHTML = data.missionTypes.map((m) => `<div class="mission-btn" onclick='chooseMission(${JSON.stringify(m)}, this)'>${m}</div>`).join('');
}
function chooseMission(m, elm) {
  form.missionType = m;
  elm.parentElement.querySelectorAll('.mission-btn').forEach((b) => b.classList.remove('on'));
  elm.classList.add('on');
}

async function toggleTeamCombo() {
  const list = el('teamAcList');
  if (list.style.display === 'block') { list.style.display = 'none'; return; }
  const data = await api(`/api/teams?category=${form.category}&actor=${encodeURIComponent(session.employee.code)}`);
  list.innerHTML = data.teams.map((t) => `<div class="combo-item" onclick='chooseTeam(${JSON.stringify(t.code)})'><span>${t.code}</span><span class="meta">${t.count} คน</span></div>`).join('') || '<div class="combo-empty">ไม่พบทีม</div>';
  list.style.display = 'block';
}
async function chooseTeam(code) {
  form.teamCode = code;
  el('teamChosen').innerHTML = `<span>${code}</span>`;
  el('teamAcList').style.display = 'none';
  const data = await api(`/api/muster-points?category=${form.category}&team_code=${encodeURIComponent(code)}`);
  form.musterPoints = data.musterPoints;
  renderMusterPointBox();
  el('branchStepCard').style.display = 'flex';
}
function renderMusterPointBox() {
  if (!form.musterPoints.length) {
    form.chosenMuster = null;
    el('musterPointBox').innerHTML = `<div class="note-box muted" style="margin-top:8px;"><b>จุดรวมพล</b>ไม่มีข้อมูลจุดรวมพลของทีมนี้ ระบบจะข้ามการตรวจระยะทางจุดรวมพล</div>`;
    return;
  }
  if (form.musterPoints.length === 1) {
    form.chosenMuster = form.musterPoints[0];
    el('musterPointBox').innerHTML = `<div class="note-box" style="margin-top:8px; background:var(--accent-soft);"><b style="color:var(--accent-deep);">จุดรวมพล</b>${form.chosenMuster.muster_name}</div>`;
    return;
  }
  form.chosenMuster = form.chosenMuster && form.musterPoints.some((p) => p.muster_name === form.chosenMuster.muster_name) ? form.chosenMuster : form.musterPoints[0];
  el('musterPointBox').innerHTML = `<span class="field-label" style="margin-top:10px;">จุดรวมพล (ทีมนี้มีมากกว่า 1 จุด เลือกได้)</span>` +
    form.musterPoints.map((p) => `<div class="muster-row ${form.chosenMuster.muster_name === p.muster_name ? 'on' : ''}" onclick='pickMusterPoint(${JSON.stringify(p.muster_name)})'>
      <div class="radio ${form.chosenMuster.muster_name === p.muster_name ? 'on' : ''}"></div><span>${p.muster_name}</span></div>`).join('');
}
function pickMusterPoint(name) {
  form.chosenMuster = form.musterPoints.find((p) => p.muster_name === name);
  renderMusterPointBox();
  if (form.branch) runMusterCheck();
}

let branchSearchToken = 0;
async function searchBranches(q) {
  const token = ++branchSearchToken;
  const data = await api('/api/branches?q=' + encodeURIComponent(q || ''));
  if (token !== branchSearchToken) return;
  const list = el('branchAcList');
  list.innerHTML = data.branches.length
    ? data.branches.map((b) => `<div class="combo-item" onclick='chooseBranch(${JSON.stringify(b)})'><span>${b.name}</span><span class="meta">${b.province || ''}</span></div>`).join('')
    : '<div class="combo-empty">ไม่พบสาขา</div>';
  list.style.display = 'block';
}
function chooseBranch(b) {
  form.branch = b;
  el('fBranchSearch').value = '';
  el('branchAcList').style.display = 'none';
  el('fBranchChosen').innerHTML = `<div class="pill pill-accent" style="font-size:12.5px; padding:8px 12px;">${icon('pin', 14)} ${b.name} · ${b.province || ''} <span style="cursor:pointer; margin-left:6px; display:inline-flex;" onclick="clearBranch()">${icon('x', 13)}</span></div>`;
  runMusterCheck();
}
function clearBranch() {
  form.branch = null; el('fBranchChosen').innerHTML = ''; el('musterCheckBox').innerHTML = '';
  ['hotelStepCard', 'dateStepCard', 'guestStepCard'].forEach((id) => (el(id).style.display = 'none'));
}
async function runMusterCheck() {
  if (!form.branch) return;
  const params = new URLSearchParams({ category: form.category, team_code: form.teamCode, branch_code: form.branch.code });
  const data = await api('/api/muster-check?' + params.toString());
  form.musterCheck = data;
  if (!data.musterPoints.length) {
    el('musterCheckBox').innerHTML = `<div class="note-box muted" style="margin-top:10px;"><b>ระยะทางจุดรวมพล</b>ไม่มีข้อมูล ข้ามการตรวจ</div>`;
    el('hotelStepCard').style.display = 'flex'; loadHotels(); return;
  }
  const chosen = data.musterPoints.find((p) => p.muster_name === form.chosenMuster?.muster_name) || data.musterPoints[0];
  if (chosen.blocked) {
    el('musterCheckBox').innerHTML = `<div class="note-box danger" style="margin-top:10px;"><b>จองที่พักไม่ได้</b>ระยะทางจากจุดรวมพล "${chosen.muster_name}" ถึงสาขานี้แค่ ${chosen.distanceKm} กม. (ต้องเกิน ${data.musterMinKm} กม. ถึงจะจองที่พักได้) — สาขานี้เดินทางไป-กลับวันเดียวได้ ไม่ต้องจองที่พัก</div>`;
    ['hotelStepCard', 'dateStepCard', 'guestStepCard'].forEach((id) => (el(id).style.display = 'none'));
    return;
  }
  if (chosen.needsNote) {
    el('musterCheckBox').innerHTML = `<div class="note-box" style="margin-top:10px;">
      <b>ระยะทางจุดรวมพล ↔ สาขา</b>${chosen.distanceKm} กม. (ไม่เกิน ${data.musterMinKm} กม. — ปกติไปเช้าเย็นกลับได้ แต่ถ้ายังจำเป็นต้องพัก ใส่หมายเหตุกำกับด้านล่าง)
      <textarea id="fMusterReason" rows="2" placeholder="เช่น ทีมนี้ชื่อโซนอยุธยาแต่สมาชิกบ้านอยู่สุพรรณบุรี ยังต้องพักจริง" style="margin-top:8px;"></textarea>
    </div>`;
  } else {
    el('musterCheckBox').innerHTML = `<div class="note-box" style="margin-top:10px; background:var(--success-soft);"><b style="color:var(--success);">ระยะทางจุดรวมพล ↔ สาขา</b>${chosen.distanceKm} กม. (เกิน ${data.musterMinKm} กม. — จองที่พักได้)</div>`;
  }
  el('hotelStepCard').style.display = 'flex';
  loadHotels();
}

async function loadHotels() {
  const params = new URLSearchParams({ branch: form.branch.code, category: form.category });
  if (form.branch2) params.set('branch2', form.branch2.code);
  const data = await api('/api/hotels-near?' + params.toString());
  form.hotelMaxKm = data.hotelMaxKm;
  el('nearHotelsList').innerHTML = data.near.map(hotelRowHtml).join('') || `<p class="empty-hint">ไม่พบที่พักในรัศมี ${data.hotelMaxKm} กม. ลองดูที่พักไกลกว่านี้</p>`;
  el('farHotelsList').innerHTML = data.far.map(hotelRowHtml).join('');
  renderHotelChips();
}
function hotelRank(code) { return form.selectedHotels.findIndex((h) => h.code === code); }
function hotelRowHtml(h) {
  const dual = !!form.branch2;
  const far = dual ? (h.distance_km_a > form.hotelMaxKm || h.distance_km_b > form.hotelMaxKm) : h.distance_km > form.hotelMaxKm;
  const rank = hotelRank(h.code);
  const badge = rank === -1
    ? `<div class="radio" style="${far ? 'border-color:var(--warning);' : ''}"></div>`
    : `<div class="avatar" style="width:22px;height:22px;font-size:11px;background:var(--accent);border-width:2px;">${rank + 1}</div>`;
  const distLabel = dual
    ? `${h.distance_km_a} กม. (${form.branch.name}) + ${h.distance_km_b} กม. (${form.branch2.name}) = ${h.distance_km} กม. รวม`
    : `${h.distance_km} กม. จากสาขา`;
  return `<div class="hotel-row" onclick='toggleHotelSelect(${JSON.stringify(h)})'>
    ${badge}
    <div style="flex:1;"><div class="hotel-name">${h.name}${h.stay_count ? ` <span class="pill pill-success" style="font-size:10px; padding:2px 8px;">เคยพักแล้ว ${h.stay_count} ครั้ง</span>` : ''}</div>
      <div class="hotel-sub" style="${far ? 'color:var(--warning-deep); font-weight:600;' : ''}">
        <span>${far ? icon('alert', 13) + ' ' : ''}${distLabel}</span>
        ${h.map_link ? `<a href="${h.map_link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icon('pin', 13)} แผนที่</a>` : ''}
        <a href="javascript:void(0)" onclick='event.stopPropagation(); openHotelReviewDetail(${JSON.stringify(h)}, "booker-form")'>${icon('search', 13)} ดูรีวิวพนักงาน</a>
      </div></div>
    <div class="hotel-price">${h.price_per_night ?? '-'}.-</div>
  </div>`;
}

// ===== รีวิวที่พัก (เปิดให้ทุกบทบาทดู/เขียนได้) =====
function openHotelReviewList() { searchHotelReviewList(''); }
async function searchHotelReviewList(q) {
  const data = await api('/api/hotels?q=' + encodeURIComponent(q || ''));
  el('hotelReviewList').innerHTML = data.hotels.length
    ? data.hotels.map(hotelReviewRowHtml).join('')
    : emptyStateHtml('search', 'ไม่พบที่พัก', 'ลองพิมพ์ชื่ออื่น หรือชื่อจังหวัด');
}
function hotelReviewRowHtml(h) {
  return `<div class="hotel-row" onclick='openHotelReviewDetail(${JSON.stringify(h)})'>
    <div style="flex:1;"><div class="hotel-name">${h.name}</div>
      <div class="hotel-sub"><span>${h.province || ''}</span>${h.stay_count ? ` <span class="pill pill-success" style="margin-left:6px;">เคยพักแล้ว ${h.stay_count} ครั้ง</span>` : ''}</div></div>
    <div class="hotel-price">${h.price_per_night ?? '-'}.-</div>
  </div>`;
}
let hotelReviewCtx = { hotel: null, reviews: [], avg: null, count: 0, photos: [] };
let reviewRating = 0;
async function openHotelReviewDetail(h, backTo) {
  hotelReviewCtx = { hotel: h, reviews: [], avg: null, count: 0, photos: [], backTo: backTo || 'hotel-reviews' };
  reviewRating = 0;
  showView('hotel-review-detail');
  await loadHotelReviews(h.code);
}
function closeHotelReviewDetail() { showView(hotelReviewCtx.backTo || 'hotel-reviews'); }
async function loadHotelReviews(code) {
  const data = await api('/api/hotel-reviews?hotel_code=' + encodeURIComponent(code));
  hotelReviewCtx.reviews = data.reviews; hotelReviewCtx.avg = data.avg; hotelReviewCtx.count = data.count;
  renderHotelReviewDetail();
}
function starsHtml(rating, size) {
  const s = size || 14;
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span style="font-size:${s}px; color:${i <= Math.round(rating) ? 'var(--warning)' : 'var(--ink-faint)'};">★</span>`;
  return out;
}
function renderHotelReviewDetail() {
  const h = hotelReviewCtx.hotel;
  const stayBadge = h.stay_count ? `<span class="pill pill-success">เคยมีคนไปพักที่นี่แล้ว ${h.stay_count} ครั้ง</span>` : `<span class="pill pill-neutral">ยังไม่มีประวัติเคยพัก</span>`;
  const avgHtml = hotelReviewCtx.count ? `${starsHtml(hotelReviewCtx.avg, 18)} <b class="num">${hotelReviewCtx.avg}</b> (${hotelReviewCtx.count} รีวิว)` : `<span style="color:var(--ink-faint);">ยังไม่มีรีวิว</span>`;
  const reviewsHtml = hotelReviewCtx.reviews.map((r) => `
    <div class="trav-card" style="cursor:default;">
      <div class="trav-top">${avatarHtml(r.employee_name, 32)}<div class="info"><h3 style="font-size:13.5px;">${r.employee_name || r.employee_code}</h3><div class="sub">${starsHtml(r.rating, 13)} · ${new Date(r.created_at).toLocaleDateString('th-TH')}</div></div></div>
      ${r.review_text ? `<div class="trav-meta" style="border-top:none; padding-top:0;">${r.review_text}</div>` : ''}
      ${(r.photo_urls || []).length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">${r.photo_urls.map((u) => `<img src="${u}" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:2px solid var(--ink);">`).join('')}</div>` : ''}
    </div>`).join('');
  el('hotelReviewDetailRoot').innerHTML = `
    <div class="page-head"><div><h2>${h.name}</h2><div class="sub">${h.province || ''}</div></div></div>
    <div style="margin-bottom:10px;">${stayBadge}</div>
    <div class="note-box muted" style="margin-bottom:14px;">${avgHtml}</div>
    <div class="section-title" style="margin-bottom:8px; display:block;">เขียนรีวิวของคุณ</div>
    <div class="card step" style="margin-bottom:16px;">
      <div id="reviewStarPicker" style="font-size:26px;">${[1, 2, 3, 4, 5].map((i) => `<span onclick="setReviewRating(${i})" data-star="${i}" style="color:var(--ink-faint); cursor:pointer;">★</span>`).join('')}</div>
      <textarea id="reviewText" rows="3" placeholder="เล่าประสบการณ์การเข้าพัก เช่น ห้องสะอาดไหม ใกล้สาขาไหม เดินทางสะดวกไหม"></textarea>
      <input type="file" id="reviewPhotoInput" accept="image/*" multiple onchange="addReviewPhotos(this.files)">
      <div id="reviewPhotoPreview" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
      <div id="reviewError"></div>
      <button class="btn btn-primary btn-sm" onclick="submitHotelReview()">ส่งรีวิว</button>
    </div>
    <div class="section-title" style="margin-bottom:8px; display:block;">รีวิวทั้งหมด (${hotelReviewCtx.count})</div>
    <div class="req-grid" style="grid-template-columns:1fr; gap:10px;">${reviewsHtml || '<p class="empty-hint">ยังไม่มีใครรีวิวที่พักนี้ เป็นคนแรกได้เลย</p>'}</div>`;
}
function setReviewRating(n) {
  reviewRating = n;
  document.querySelectorAll('#reviewStarPicker span').forEach((s) => { s.style.color = Number(s.dataset.star) <= n ? 'var(--warning)' : 'var(--ink-faint)'; });
}
function addReviewPhotos(files) {
  for (const f of files) hotelReviewCtx.photos.push(f);
  renderReviewPhotoPreview();
}
function removeReviewPhoto(i) { hotelReviewCtx.photos.splice(i, 1); renderReviewPhotoPreview(); }
function renderReviewPhotoPreview() {
  el('reviewPhotoPreview').innerHTML = hotelReviewCtx.photos.map((f, i) => `<span class="guest-chip">${f.name}<span class="x" onclick="removeReviewPhoto(${i})">${icon('x', 12)}</span></span>`).join('');
}
async function submitHotelReview() {
  el('reviewError').innerHTML = '';
  if (!reviewRating) { el('reviewError').innerHTML = errBox('ต้องให้คะแนนอย่างน้อย 1 ดาว'); return; }
  const fd = new FormData();
  fd.append('hotel_code', hotelReviewCtx.hotel.code);
  fd.append('actor', session.employee.code);
  fd.append('rating', String(reviewRating));
  fd.append('review_text', el('reviewText').value.trim());
  hotelReviewCtx.photos.forEach((f) => fd.append('photos', f));
  try {
    const res = await fetch('/api/hotel-reviews', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ส่งรีวิวไม่สำเร็จ');
    reviewRating = 0; hotelReviewCtx.photos = [];
    el('reviewText').value = ''; el('reviewPhotoInput').value = ''; renderReviewPhotoPreview();
    await loadHotelReviews(hotelReviewCtx.hotel.code);
  } catch (e) {
    el('reviewError').innerHTML = errBox(e.message);
  }
}
function toggleHotelSelect(h) {
  const idx = hotelRank(h.code);
  if (idx !== -1) { form.selectedHotels.splice(idx, 1); }
  else {
    if (form.selectedHotels.length >= 5) { el('hotelPickError').textContent = 'เลือกได้สูงสุด 5 อันดับ ลบอันที่ไม่ต้องการออกก่อน'; return; }
    form.selectedHotels.push(h);
  }
  el('hotelPickError').textContent = '';
  loadHotels();
  const primary = form.selectedHotels[0];
  const anyFar = form.selectedHotels.some((sh) => form.branch2 ? (sh.distance_km_a > form.hotelMaxKm || sh.distance_km_b > form.hotelMaxKm) : sh.distance_km > form.hotelMaxKm);
  el('farReasonBox').style.display = anyFar ? 'block' : 'none';
  if (primary) { renderDistanceMap(); el('dateStepCard').style.display = 'flex'; checkDatesReady(); }
  else { el('distanceMapBox').innerHTML = ''; el('dateStepCard').style.display = 'none'; }
}
function renderHotelChips() {
  el('hotelChipRow').innerHTML = form.selectedHotels.length
    ? form.selectedHotels.map((h, i) => {
        const far = h.distance_km > form.hotelMaxKm;
        return `<div class="guest-chip"><span class="avatar" style="width:20px;height:20px;font-size:10px;background:${i === 0 ? 'var(--accent)' : 'var(--info)'};">${i + 1}</span>${h.name}${i === 0 ? ' (หลัก)' : ''} · <span style="${far ? 'color:var(--warning-deep); font-weight:700;' : ''}">${h.distance_km} กม.${far ? ' ' + icon('alert', 11) : ''}</span><span class="x" onclick='toggleHotelSelect(${JSON.stringify(h)})'>${icon('x', 12)}</span></div>`;
      }).join('')
    : `<span style="font-size:12px; color:var(--ink-faint);">ยังไม่ได้เลือก — แตะที่พักด้านล่างเพื่อเริ่มเลือก (อย่างน้อย 3 ที่)</span>`;
}
function renderDistanceMap() {
  const m = form.chosenMuster, b = form.branch, h = form.selectedHotels[0];
  const mb = m ? haversineKm(m.lat, m.lng, b.lat, b.lng) : null;
  const bh = haversineKm(b.lat, b.lng, h.lat, h.lng);
  const total = (mb || 0) + (bh || 0);
  el('distanceMapBox').innerHTML = `
    <div class="dist-map"><svg viewBox="0 0 400 150" style="width:100%; height:100%; display:block;">
      <line x1="50" y1="115" x2="200" y2="55" stroke="var(--ink-faint)" stroke-width="1.6" stroke-dasharray="5 5"/>
      <line x1="200" y1="55" x2="350" y2="115" stroke="var(--ink-faint)" stroke-width="1.6" stroke-dasharray="5 5"/>
      <circle cx="50" cy="115" r="7" fill="var(--accent)"/><text x="50" y="138" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="IBM Plex Sans Thai">จุดรวมพล</text>
      <circle cx="200" cy="55" r="7" fill="var(--warning)"/><text x="200" y="40" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="IBM Plex Sans Thai">สาขา</text>
      <circle cx="350" cy="115" r="7" fill="var(--success)"/><text x="350" y="138" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="IBM Plex Sans Thai">ที่พัก</text>
    </svg></div>
    <div class="dist-legend">
      <span>จุดรวมพล→สาขา: <b>${mb ?? '-'}</b> กม.</span>
      <span>สาขา→ที่พัก: <b>${bh ?? '-'}</b> กม.</span>
      <span>รวม: <b>${total.toFixed(1)}</b> กม.</span>
    </div>`;
}
function checkDatesReady() {
  if (el('fCheckin').value && el('fCheckout').value) {
    el('guestStepCard').style.display = 'flex';
    el('guestTeamLabel').textContent = form.teamCode || '';
  }
}
el('fCheckin').addEventListener('change', checkDatesReady);
el('fCheckout').addEventListener('change', checkDatesReady);
function toggleFarHotels() { const box = el('farHotelsList'); box.style.display = box.style.display === 'none' ? 'block' : 'none'; }

// ===== ที่พักที่ไม่มีในทะเบียน — เพิ่มเองด้วยชื่อ+พิกัด+ราคา แล้วเลือกใช้ในคำขอนี้ได้ทันที =====
function showAddHotelForm() { el('addHotelForm').style.display = 'flex'; }
async function addNewHotel() {
  el('addHotelError').innerHTML = '';
  const name = el('newHotelName').value.trim();
  const coordsRaw = el('newHotelCoords').value.trim();
  const price = el('newHotelPrice').value.trim();
  if (!name) { el('addHotelError').innerHTML = errBox('ต้องใส่ชื่อที่พัก'); return; }
  const m = coordsRaw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) { el('addHotelError').innerHTML = errBox('พิกัดไม่ถูกต้อง — ใส่แบบ 13.7563, 100.5018'); return; }
  if (!price) { el('addHotelError').innerHTML = errBox('ต้องใส่ราคาห้อง/คืน'); return; }
  try {
    const data = await api('/api/hotels/custom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, lat: Number(m[1]), lng: Number(m[2]), price_per_night: Number(price), actor: session.employee.code }),
    });
    const h = data.hotel;
    const distA = form.branch ? haversineKm(form.branch.lat, form.branch.lng, h.lat, h.lng) : null;
    const distB = form.branch2 ? haversineKm(form.branch2.lat, form.branch2.lng, h.lat, h.lng) : null;
    const distance_km = form.branch2 ? (distA != null && distB != null ? Math.round((distA + distB) * 10) / 10 : null) : distA;
    el('newHotelName').value = ''; el('newHotelCoords').value = ''; el('newHotelPrice').value = ''; el('addHotelForm').style.display = 'none';
    toggleHotelSelect({ ...h, distance_km, distance_km_a: distA, distance_km_b: distB });
  } catch (e) {
    el('addHotelError').innerHTML = errBox(e.message);
  }
}

// ===== guests: click-to-add from own team roster, or search another team =====
function isGuestSelected(code) { return form.guests.some((g) => g.employee_code === code); }

async function openTeamRosterList() {
  const list = el('teamRosterList');
  if (list.style.display === 'block') { list.style.display = 'none'; return; }
  const params = new URLSearchParams({ category: form.category, team: form.teamCode, checkin: el('fCheckin').value, checkout: el('fCheckout').value });
  const data = await api('/api/staff?' + params.toString());
  renderStaffList(list, data.staff);
  list.style.display = 'block';
}
function toggleOtherTeamSearch() {
  const box = el('otherTeamBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') el('guestSearch').focus();
}
async function searchGuests(q) {
  const params = new URLSearchParams({ category: form.category, q: q || '', checkin: el('fCheckin').value, checkout: el('fCheckout').value });
  const data = await api('/api/staff?' + params.toString());
  renderStaffList(el('guestAcList'), data.staff.filter((s) => s.team_code !== form.teamCode));
}
function renderStaffList(listEl, staff) {
  const rows = staff.filter((s) => !isGuestSelected(s.code));
  if (!rows.length) { listEl.innerHTML = '<div class="combo-empty">ไม่พบพนักงาน</div>'; listEl.style.display = 'block'; return; }
  listEl.innerHTML = rows.map((s) => {
    const blocked = !!s.openBooking;
    return `<div class="combo-item ${blocked ? 'staff-blocked' : ''}" ${blocked ? '' : `onclick='addGuestFromStaff(${JSON.stringify(s)})'`}>
      <span>${s.name} (${s.nickname || s.team_code || '-'})</span>
      <span class="meta">${blocked ? 'มีแผนจองแล้ว (' + s.openBooking.branch + ' ' + s.openBooking.dates + ')' : s.team_code || ''}</span>
    </div>`;
  }).join('');
  listEl.style.display = 'block';
}
function addGuestFromStaff(staff) {
  if (isGuestSelected(staff.code) || staff.openBooking) return;
  form.guests.push({ employee_code: staff.code, name: staff.name, phone: staff.phone, gender: staff.gender, nickname: staff.nickname, _uid: guestUidSeq++ });
  el('guestSearch').value = ''; el('guestAcList').style.display = 'none'; el('teamRosterList').style.display = 'none';
  renderGuestChips();
}
function removeGuest(idx) {
  const [removed] = form.guests.splice(idx, 1);
  if (removed) form.roomAssignments.forEach((room) => { room.slots = room.slots.map((u) => (u === removed._uid ? null : u)); });
  renderGuestChips();
}
function showAddGuestForm() { el('addGuestForm').style.display = 'flex'; }
function addNewGuest() {
  const name = el('newGuestName').value.trim();
  if (!name) return;
  form.guests.push({ employee_code: el('newGuestCode').value.trim() || null, name, gender: el('newGuestGender').value, _uid: guestUidSeq++ });
  el('newGuestCode').value = ''; el('newGuestName').value = ''; el('addGuestForm').style.display = 'none';
  renderGuestChips();
}
function renderGuestChips() {
  el('guestChipRow').innerHTML = form.guests.map((g, i) => `
    <div class="guest-chip">${avatarHtml(g.name, 22, g.gender)}${g.name}${g.nickname ? ' (' + g.nickname + ')' : ''}${!g.employee_code ? ' <span class="new-tag">ใหม่</span>' : ''}<span class="x" onclick="removeGuest(${i})">${icon('x', 12)}</span></div>`
  ).join('');
  updateGuestSummary();
  renderRoomAssign();
}
function updateGuestSummary() {
  const box = el('guestSummary');
  if (!form.guests.length) { box.style.display = 'none'; return; }
  const male = form.guests.filter((g) => g.gender === 'M').length;
  const female = form.guests.filter((g) => g.gender === 'F').length;
  const rooms = roomsNeededFor(form.guests);
  box.style.display = 'block';
  box.innerHTML = `<b>${form.guests.length} คน</b> (ชาย ${male} · หญิง ${female}) → อย่างน้อย ${rooms} ห้อง`;
}

// ===== room assignment (ห้อง 1-2 คนต่อห้อง, เพศเดียวกันเท่านั้น) =====
function roomsNeededFor(guests) {
  const male = guests.filter((g) => g.gender === 'M').length;
  const female = guests.filter((g) => g.gender === 'F').length;
  return Math.ceil(male / 2) + Math.ceil(female / 2);
}
function assignedGuestUids() {
  const s = new Set();
  form.roomAssignments.forEach((room) => room.slots.forEach((u) => { if (u != null) s.add(u); }));
  return s;
}
function guestByUid(uid) { return form.guests.find((g) => g._uid === uid); }
function roomNoForGuestUid(uid) {
  for (let i = 0; i < form.roomAssignments.length; i++) {
    if (form.roomAssignments[i].slots.includes(uid)) return i + 1;
  }
  return null;
}
function ensureRoomCount(min) {
  if (form.roomCount == null || form.roomCount < min) form.roomCount = min;
  while (form.roomAssignments.length < form.roomCount) form.roomAssignments.push({ slots: [null, null] });
  while (form.roomAssignments.length > form.roomCount) form.roomAssignments.pop();
}
function setRoomCount(raw) {
  const min = roomsNeededFor(form.guests);
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) n = min;
  form.roomCount = n;
  ensureRoomCount(min);
  renderRoomAssign();
}
function setRoomSlot(roomIdx, slotIdx, rawUid) {
  const uid = rawUid === '' ? null : Number(rawUid);
  form.roomAssignments[roomIdx].slots[slotIdx] = uid;
  if (slotIdx === 0 && uid == null) form.roomAssignments[roomIdx].slots[1] = null; // เคลียร์คนที่ 1 ต้องเคลียร์คนที่ 2 ด้วย เพราะล็อกเพศตามคนที่ 1
  renderRoomAssign();
}
function renderRoomAssign() {
  const box = el('roomAssignBox');
  if (!form.guests.length) { box.style.display = 'none'; return; }
  const min = roomsNeededFor(form.guests);
  ensureRoomCount(min);
  const assigned = assignedGuestUids();
  const optionsFor = (room, slotIdx) => {
    const currentUid = room.slots[slotIdx];
    const firstGuest = room.slots[0] != null ? guestByUid(room.slots[0]) : null;
    const lockedGender = slotIdx === 1 && firstGuest ? firstGuest.gender : null;
    const opts = form.guests.filter((g) => {
      if (g._uid === currentUid) return true;
      if (assigned.has(g._uid)) return false;
      if (lockedGender && g.gender !== lockedGender) return false;
      return true;
    });
    const placeholder = slotIdx === 0 ? '— เลือกคนที่ 1 —' : '— ว่าง (ไม่มีคนพักคู่) —';
    return `<option value="">${placeholder}</option>` + opts.map((g) =>
      `<option value="${g._uid}" ${g._uid === currentUid ? 'selected' : ''}>${g.name}${g.nickname ? ' (' + g.nickname + ')' : ''} · ${g.gender === 'F' ? 'หญิง' : 'ชาย'}</option>`
    ).join('');
  };
  const roomsHtml = form.roomAssignments.map((room, ri) => {
    const firstGuest = room.slots[0] != null ? guestByUid(room.slots[0]) : null;
    const genderTag = firstGuest ? ' · ' + (firstGuest.gender === 'F' ? 'หญิง' : 'ชาย') : '';
    return `<div class="note-box muted" style="margin-top:8px;">
      <b>ห้อง ${ri + 1}${genderTag}</b>
      <div class="field-row" style="margin-top:4px;">
        <select onchange="setRoomSlot(${ri},0,this.value)">${optionsFor(room, 0)}</select>
        <select onchange="setRoomSlot(${ri},1,this.value)" ${room.slots[0] == null ? 'disabled' : ''}>${optionsFor(room, 1)}</select>
      </div>
    </div>`;
  }).join('');
  const doneCount = assigned.size;
  const allDone = doneCount === form.guests.length;
  box.style.display = 'block';
  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
      <span class="field-label" style="margin:0;">จำนวนห้องพัก</span>
      <input type="number" min="${min}" value="${form.roomCount}" style="max-width:80px;" onchange="setRoomCount(this.value)">
    </div>
    <div class="note-box ${allDone ? 'success' : 'muted'}" style="margin-top:8px;"><b>จัดห้องพัก</b>จัดแล้ว ${doneCount}/${form.guests.length} คน${allDone ? '' : ' — ต้องจัดครบทุกคนก่อนส่งคำขอ'}</div>
    ${roomsHtml}
  `;
}

async function submitRequest() {
  el('formError').innerHTML = '';
  if (form.selectedHotels.length < 3) {
    el('formError').innerHTML = errBox('ต้องเลือกที่พักอย่างน้อย 3 อันดับ (หลัก 1 + สำรอง)');
    return;
  }
  if (!form.guests.length) {
    el('formError').innerHTML = errBox('ต้องมีผู้เข้าพักอย่างน้อย 1 คน');
    return;
  }
  const unassigned = form.guests.filter((g) => roomNoForGuestUid(g._uid) == null);
  if (unassigned.length) {
    el('formError').innerHTML = errBox(`ต้องจัดห้องพักให้ครบทุกคนก่อนส่งคำขอ (เหลือ ${unassigned.length} คน)`);
    return;
  }
  const body = {
    team_category: form.category, mission_type: form.missionType, team_code: form.teamCode,
    muster_name: form.chosenMuster?.muster_name || null,
    muster_reason: el('fMusterReason')?.value.trim() || null,
    branch_code: form.branch?.code,
    checkin_date: el('fCheckin').value, checkout_date: el('fCheckout').value,
    hotel_codes: form.selectedHotels.map((h) => h.code),
    far_reason: el('fFarReason').value.trim() || null,
    created_by: session.employee.code,
    guests: form.guests.map((g) => ({ employee_code: g.employee_code || null, name: g.name, phone: g.phone || null, gender: g.gender, room_no: roomNoForGuestUid(g._uid) })),
    schedule_entry_id: form.scheduleEntryId || null,
  };
  try {
    el('submitBtn').disabled = true;
    await api('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (currentRole === 'employee') { showView('employee-view'); loadEmployeeView(); }
    else { showView('booker-home'); loadBookerHome(); }
  } catch (e) {
    el('formError').innerHTML = errBox(e.message);
  } finally {
    el('submitBtn').disabled = false;
  }
}

// ===== booking detail =====
async function openDetail(id, backTarget, readonly) {
  detailCtx = { backTarget, readonly: !!readonly, requestId: id };
  const data = await api('/api/requests/' + id);
  el('detailRoot').innerHTML = detailHtml(data.request);
  showView('booking-detail');
}
// วอยเชอร์เป็นได้ทั้งรูป (แสดงตัวอย่างในหน้าได้เลย) หรือ PDF (โชว์ตัวอย่างในหน้าไม่ได้ ให้ลิงก์เปิดแทน)
function voucherHtml(url) {
  if (!url) return '';
  const isPdf = /\.pdf($|\?)/i.test(url);
  const body = isPdf
    ? `<a href="${url}" target="_blank" rel="noopener" class="btn btn-sm" style="display:inline-flex;">${icon('hotel', 14)} เปิดวอยเชอร์ (PDF)</a>`
    : `<img src="${url}" alt="วอยเชอร์" style="max-width:220px; border-radius:8px; border:1px solid var(--line);">`;
  return `<div style="margin-top:8px;">${body}</div>`;
}
function detailHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  const doneNote = `<div class="note-box success"><b>จองสำเร็จแล้ว</b>${r.confirmation_no ? `เลขยืนยัน <span class="num">${r.confirmation_no}</span>` : ''}${voucherHtml(r.voucher_url)}</div>`;
  let gate = '';
  if (detailCtx.readonly) {
    if (r.status === 'done') gate = doneNote;
    else if (r.status === 'booked') gate = `<div class="note-box muted"><b>จองแล้ว รอเจ้าของทีมอนุมัติ</b>ดูได้อย่างเดียว</div>`;
    else if (r.status === 'approved') gate = `<div class="note-box muted"><b>อนุมัติแล้ว รอ AREA ยืนยันปิดงาน</b>ดูได้อย่างเดียว</div>`;
    else gate = `<div class="note-box muted"><b>ยังไม่จองสำเร็จ</b>ดูได้อย่างเดียว</div>`;
  } else if (r.status === 'pending') {
    gate = `<button class="btn btn-success btn-block" onclick="openBook(${r.id})">${icon('check', 16)} เลือกที่พักที่จะจอง → ส่งให้อนุมัติ</button>`;
  } else if (r.status === 'booked') {
    gate = `<div class="note-box muted"><b>จองแล้ว</b>รอเจ้าของทีมอนุมัติ — ที่พัก <b>${r.hotel?.name || '-'}</b></div>`;
  } else if (r.status === 'approved') {
    gate = `<button class="btn btn-success btn-block" onclick="openFinalize(${r.id})">${icon('check', 16)} ยืนยันที่พัก → ปิดงาน</button>`;
  } else if (r.status === 'done') {
    gate = doneNote;
  } else if (r.status === 'rejected') {
    gate = `<div class="note-box danger"><b>ถูกตีกลับ</b>${r.reject_reason || ''}</div>`;
  } else {
    gate = `<div class="note-box muted"><b>ยังกดจองสำเร็จไม่ได้</b>ต้องรอผู้อนุมัติกดอนุมัติก่อน</div>`;
  }
  const kv = (icon, k, v) => `<div class="kv"><div class="ic">${icon}</div><div class="tx"><span class="k">${k}</span><span class="v">${v}</span></div></div>`;
  const personBlock = (g, i) => `
    <div class="person-block">
      <div class="person-head">${avatarHtml(g.name, 26, g.gender)}<b>คนที่ ${i + 1}${g.gender ? ' · ' + (g.gender === 'M' ? 'ชาย' : 'หญิง') : ''}</b></div>
      <div class="person-field"><div><span class="k">รหัสพนักงาน</span><span class="v">${g.employee_code || '-'}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.employee_code || '-')}, this)'>${icon('copy', 14)}</button></div>
      <div class="person-field"><div><span class="k">ชื่อ-นามสกุล</span><span class="v" style="font-family:inherit;">${g.name}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.name)}, this)'>${icon('copy', 14)}</button></div>
      <div class="person-field"><div><span class="k">เบอร์โทร</span><span class="v">${g.phone || '-'}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.phone || '-')}, this)'>${icon('copy', 14)}</button></div>
    </div>`;
  const groupedGuests = groupGuestsByRoom(r.guests);
  let personBlocks;
  if (!groupedGuests) {
    personBlocks = sortByGender(r.guests).map(personBlock).join('');
  } else {
    let counter = 0;
    const roomBlocks = groupedGuests.rooms.map((room) => {
      const genderTag = room.members[0]?.gender ? ' · ' + (room.members[0].gender === 'M' ? 'ชาย' : 'หญิง') : '';
      return `<div class="section-title" style="margin:10px 0 6px; font-size:12px;">ห้อง ${room.room_no}${genderTag}</div>${sortByGender(room.members).map((g) => personBlock(g, counter++)).join('')}`;
    }).join('');
    const unassignedBlock = groupedGuests.unassigned.length
      ? `<div class="section-title" style="margin:10px 0 6px; font-size:12px;">ยังไม่ระบุห้อง</div>${sortByGender(groupedGuests.unassigned).map((g) => personBlock(g, counter++)).join('')}`
      : '';
    personBlocks = roomBlocks + unassignedBlock;
  }
  const candidates = r.hotelCandidates && r.hotelCandidates.length ? r.hotelCandidates : (r.hotel ? [r.hotel] : []);
  const candDist = (h) => (r.branch?.lat != null && h.lat != null ? haversineKm(r.branch.lat, r.branch.lng, h.lat, h.lng) : null);
  const isChosen = ['booked', 'approved', 'done'].includes(r.status);
  const hotelListText = isChosen ? (r.hotel?.name || '-') : candidates.map((h, i) => `${i + 1}. ${h.name} (${candDist(h) ?? '-'} กม.)`).join(' / ');
  const hotelKvValue = isChosen
    ? (r.hotel?.name || '-')
    : candidates.map((h, i) => {
        const d = candDist(h);
        const far = d != null && r.hotelMaxKm != null && d > r.hotelMaxKm;
        return `<div>${i + 1}. ${h.name}${i === 0 ? ' <span style="color:var(--accent-deep); font-weight:700;">(หลัก)</span>' : ''}${d != null ? ` · <span style="${far ? 'color:var(--warning-deep); font-weight:700;' : ''}">${d} กม.${far ? ' ' + icon('alert', 12) : ''}</span>` : ''}</div>`;
      }).join('');
  return `
    <button class="back-link" onclick="showView('${detailCtx.backTarget}')">‹ กลับ</button>
    <div class="page-head"><div><h2>รายละเอียดการจอง</h2><div class="sub">ใช้หน้านี้ก็อบข้อมูลไปกรอกจองในระบบ Choowap${!isChosen ? ' — ลองจองตามลำดับที่พักด้านล่าง ถ้าที่ 1 เต็มให้ลองที่ 2, 3 ต่อไป' : ''}</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="copy-block">
      <div class="copy-head"><span>ข้อมูลที่พัก / ทริป</span><button class="btn btn-sm" onclick='copyText(${JSON.stringify(`ประเภทงาน: ${r.mission_type}\nทีม: ${r.team_code}\nสาขา: ${r.branch?.name}\nที่พัก: ${hotelListText}\nเข้าพัก: ${r.checkin_date}\nเช็คเอาท์: ${r.checkout_date}\nจำนวนคืน: ${r.nights}\nจำนวนคน: ${r.guests.length}\nจำนวนห้อง: ${r.rooms}\n${guestsCopyLines(r)}`)}, this)'>${icon('copy', 14)} ก็อบปี้</button></div>
      <div class="kv-grid">
        ${kv(icon('briefcase', 16), 'ประเภทงาน', r.mission_type)}
        ${kv(icon('users', 16), 'ทีม', r.team_code || '-')}
        ${kv(icon('pin', 16), 'สาขาที่ไป', (r.branch?.name || '') + ', ' + (r.branch?.province || ''))}
        ${kv(icon('hotel', 16), isChosen ? 'ที่พัก' : `ที่พัก (${candidates.length} อันดับ)`, hotelKvValue)}
        ${kv(icon('calendar', 16), 'วันเข้าพัก', `<span class="num">${r.checkin_date}</span>`)}
        ${kv(icon('calendar', 16), 'วันเช็คเอาท์', `<span class="num">${r.checkout_date}</span>`)}
        ${kv(icon('moon', 16), 'จำนวนคืน', `<span class="num">${r.nights} คืน</span>`)}
        ${kv(icon('users', 16), 'จำนวนคน', `<span class="num">${r.guests.length} คน</span>`)}
        ${kv(icon('bed', 16), 'จำนวนห้อง', `<span class="num">${r.rooms} ห้อง</span>`)}
      </div>
    </div>
    ${r.muster ? `<div class="note-box muted" style="margin-top:12px;"><b>ระยะทาง</b>จุดรวมพล (${r.muster.name}) → สาขา ${r.musterBranchKm ?? '-'} กม. · สาขา → ที่พัก ${r.branchHotelKm ?? '-'} กม. · รวม ${r.totalKm?.toFixed ? r.totalKm.toFixed(1) : r.totalKm} กม.</div>` : ''}
    <div class="section-title" style="margin:14px 0 10px; display:block;">ข้อมูลผู้เข้าพัก · ก็อบทีละคน</div>
    <div class="req-grid" style="grid-template-columns:1fr; gap:10px;">${personBlocks}</div>
    <div style="margin-top:16px;">${gate}</div>`;
}
let completeChosenHotel = null;
let completeCandidates = [];
// ขั้นที่ 1: AREA เลือกว่าจะจองที่พักอันไหนจริง — ยังไม่มีเลขยืนยัน เพราะยังไม่ได้อนุมัติ (pending -> booked)
async function openBook(id) {
  const data = await api('/api/requests/' + id);
  const r = data.request;
  const candidates = r.hotelCandidates && r.hotelCandidates.length ? r.hotelCandidates : (r.hotel ? [r.hotel] : []);
  completeCandidates = candidates;
  completeChosenHotel = candidates[0]?.code || null;
  el('completeRoot').innerHTML = `
    <button class="back-link" onclick="openDetail(${id}, '${detailCtx.backTarget}', false); showView('booking-detail');">‹ กลับไปรายละเอียดการจอง</button>
    <div class="card" style="border-color:var(--success); background:var(--success-soft); display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:2px;">
        ${EMPTY_ILLUSTRATIONS.allDone}
        <div class="section-title" style="color:var(--success-deep);">เลือกที่พักที่จะจองจริง</div>
        <p style="font-size:12.5px; color:var(--ink-soft); margin:0;">${r.branch?.name} · ${r.checkin_date} – ${r.checkout_date}</p>
      </div>
      <div>
        <span class="field-label">ที่พักที่จะจอง (เลือกจาก ${candidates.length} อันดับที่เลือกไว้)</span>
        <div id="completeHotelList">${candidates.map((h, i) => completeHotelRowHtml(h, i)).join('')}</div>
      </div>
      <div id="completeError"></div>
      <button class="btn btn-success btn-block" onclick="submitBook(${id})">บันทึกว่าจองแล้ว → ส่งให้เจ้าของทีมอนุมัติ</button>
    </div>`;
  showView('booking-complete');
}
function completeHotelRowHtml(h, i) {
  const selected = completeChosenHotel === h.code;
  return `<div class="hotel-row" onclick='chooseCompleteHotel(${JSON.stringify(h.code)})'>
    <div class="radio ${selected ? 'on' : ''}"></div>
    <div style="flex:1;"><div class="hotel-name">${i + 1}. ${h.name}${i === 0 ? ' (อันดับหลัก)' : ''}</div></div>
    <div class="hotel-price">${h.price_per_night ?? '-'}.-</div>
  </div>`;
}
function chooseCompleteHotel(code) {
  completeChosenHotel = code;
  el('completeHotelList').innerHTML = completeCandidates.map((h, i) => completeHotelRowHtml(h, i)).join('');
}
async function submitBook(id) {
  if (!completeChosenHotel) { el('completeError').innerHTML = errBox('ต้องเลือกว่าจะจองที่พักอันไหน'); return; }
  try {
    await api('/api/requests/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'book', actor: session.employee.code, chosen_hotel_code: completeChosenHotel }) });
    showView(detailCtx.backTarget === 'approver-queue' ? 'approver-queue' : 'booker-home');
    if (currentRole === 'booker') loadBookerHome();
    if (currentRole === 'approver') loadApproverQueue();
  } catch (e) {
    el('completeError').innerHTML = errBox(e.message);
  }
}
// ขั้นที่ 2: หลังเจ้าของทีมอนุมัติแล้ว AREA แค่ยืนยันที่พักที่ได้จริงอีกครั้ง (แก้ได้ถ้าเปลี่ยน) แล้วปิดงาน (approved -> done)
let finalizeChosenHotel = null;
let finalizeCandidates = [];
async function openFinalize(id) {
  const data = await api('/api/requests/' + id);
  const r = data.request;
  const candidates = r.hotelCandidates && r.hotelCandidates.length ? r.hotelCandidates : (r.hotel ? [r.hotel] : []);
  finalizeCandidates = candidates;
  finalizeChosenHotel = r.hotel?.code || candidates[0]?.code || null;
  el('completeRoot').innerHTML = `
    <button class="back-link" onclick="openDetail(${id}, '${detailCtx.backTarget}', false); showView('booking-detail');">‹ กลับไปรายละเอียดการจอง</button>
    <div class="card" style="border-color:var(--success); background:var(--success-soft); display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:2px;">
        ${EMPTY_ILLUSTRATIONS.allDone}
        <div class="section-title" style="color:var(--success-deep);">เจ้าของทีมอนุมัติแล้ว — ยืนยันที่พักที่ได้จริงเพื่อปิดงาน</div>
        <p style="font-size:12.5px; color:var(--ink-soft); margin:0;">${r.branch?.name} · ${r.checkin_date} – ${r.checkout_date}</p>
      </div>
      <div>
        <span class="field-label">ที่พักที่จองได้จริง (แก้ได้ถ้าเปลี่ยน)</span>
        <div id="finalizeHotelList">${candidates.map((h, i) => finalizeHotelRowHtml(h, i)).join('')}</div>
      </div>
      <div id="finalizeError"></div>
      <button class="btn btn-success btn-block" onclick="submitFinalize(${id})">ยืนยันที่พัก → ปิดงาน</button>
    </div>`;
  showView('booking-complete');
}
function finalizeHotelRowHtml(h, i) {
  const selected = finalizeChosenHotel === h.code;
  return `<div class="hotel-row" onclick='chooseFinalizeHotel(${JSON.stringify(h.code)})'>
    <div class="radio ${selected ? 'on' : ''}"></div>
    <div style="flex:1;"><div class="hotel-name">${i + 1}. ${h.name}${i === 0 ? ' (อันดับหลัก)' : ''}</div></div>
    <div class="hotel-price">${h.price_per_night ?? '-'}.-</div>
  </div>`;
}
function chooseFinalizeHotel(code) {
  finalizeChosenHotel = code;
  el('finalizeHotelList').innerHTML = finalizeCandidates.map((h, i) => finalizeHotelRowHtml(h, i)).join('');
}
async function submitFinalize(id) {
  if (!finalizeChosenHotel) { el('finalizeError').innerHTML = errBox('ต้องเลือกว่าได้ที่พักอันไหนจริง'); return; }
  try {
    await api('/api/requests/' + id + '/finalize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: session.employee.code, chosen_hotel_code: finalizeChosenHotel }),
    });
    showView(detailCtx.backTarget === 'approver-queue' ? 'approver-queue' : 'booker-home');
    if (currentRole === 'booker') loadBookerHome();
    if (currentRole === 'approver') loadApproverQueue();
  } catch (e) {
    el('finalizeError').innerHTML = errBox(e.message);
  }
}

// ===== approver =====
let approverAllReqs = [];
let approverShowArchive = false;
let approverStatusFilter = null;
async function loadApproverQueue() {
  el('approverSubtitle').textContent = CATEGORY_LABEL[approverCategory];
  const data = await api(`/api/requests?role=approver&category=${approverCategory}`);
  approverAllReqs = data.requests;
  approverShowArchive = false;
  approverStatusFilter = null;
  renderApproverList();
  el('approverDetailRoot').innerHTML = '<p class="empty-hint" style="padding:60px 20px;">เลือกคำขอทางซ้ายเพื่อดูรายละเอียด</p>';
  document.querySelector('[data-view="approver-queue-list"]').classList.add('active');
  document.querySelector('[data-view="approver-detail-panel"]').classList.remove('active');
}
function toggleApproverArchive() { approverShowArchive = !approverShowArchive; approverStatusFilter = null; renderApproverList(); }
function filterApproverByStatus(status) { approverStatusFilter = approverStatusFilter === status ? null : status; renderApproverList(); }
function renderApproverList() {
  // เรียงให้ 'booked' (รอคุณอนุมัติ) ขึ้นก่อนเสมอ เพราะเป็นสถานะเดียวที่ต้องให้คุณกดจริง
  const actionRank = (s) => (s === 'booked' ? 0 : s === 'pending' ? 1 : s === 'approved' ? 2 : 3);
  const reqs = approverAllReqs.slice().sort((a, b) => actionRank(a.status) - actionRank(b.status));
  const counts = { pending: 0, booked: 0, approved: 0, done: 0, rejected: 0 };
  reqs.forEach((r) => counts[r.status]++);
  const tile = (status, iconName, label) => `<div class="snap" style="cursor:pointer; ${approverStatusFilter === status ? 'border-color:var(--accent); box-shadow:var(--shadow);' : ''}" onclick="filterApproverByStatus('${status}')"><div class="ic">${icon(iconName, 20)}</div><div class="tx"><b class="num">${counts[status]}</b><span>${label}</span></div></div>`;
  el('approverStats').innerHTML =
    tile('booked', 'clock', 'รอคุณอนุมัติ') + tile('pending', 'package', 'รอ AREA จอง') + tile('approved', 'package', 'รอ AREA ยืนยันปิดงาน') +
    tile('done', 'check', 'จองสำเร็จ') + tile('rejected', 'undo', 'ตีกลับ');

  let shown, emptyKind, emptyTitle, emptySub;
  if (approverStatusFilter) {
    shown = reqs.filter((r) => r.status === approverStatusFilter);
    el('approverArchiveToggle').innerHTML = `<button class="btn btn-ghost btn-sm" onclick="filterApproverByStatus('${approverStatusFilter}')">‹ ล้างตัวกรอง แสดงทั้งหมด</button>`;
    emptyKind = 'search'; emptyTitle = 'ไม่พบรายการในสถานะนี้'; emptySub = '';
  } else {
    const active = reqs.filter((r) => r.status === 'pending' || r.status === 'booked' || r.status === 'approved');
    const archived = reqs.filter((r) => r.status === 'done' || r.status === 'rejected');
    shown = approverShowArchive ? archived : active;
    el('approverArchiveToggle').innerHTML = approverShowArchive
      ? `<button class="btn btn-ghost btn-sm" onclick="toggleApproverArchive()">‹ กลับไปคิวที่รอดำเนินการ</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="toggleApproverArchive()">${icon('package', 14)} ดูประวัติที่จบแล้ว (${archived.length})</button>`;
    emptyKind = approverShowArchive ? 'search' : 'allDone';
    emptyTitle = approverShowArchive ? 'ยังไม่มีประวัติ' : 'ไม่มีคำขอค้างอยู่';
    emptySub = approverShowArchive ? 'คำขอที่จองสำเร็จหรือถูกตีกลับจะมาอยู่ที่นี่' : 'คำขอใหม่จะมาปรากฏที่นี่';
  }
  el('approverList').innerHTML = shown.length ? shown.map(approverCardHtml).join('') : emptyStateHtml(emptyKind, emptyTitle, emptySub);
}
function approverCardHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  const dup = r.dupWarnings.length ? `<span class="pill pill-danger" style="margin-left:6px;">ชื่อซ้ำ</span>` : '';
  const bookerName = r.createdByName || r.created_by;
  return `<div class="trav-card" onclick="openApproverDetail(${r.id})">
    <div class="trav-top">${avatarHtml(bookerName, 36)}<div class="info"><h3>${r.branch?.name || r.branch_code}</h3><div class="sub">จองโดย ${bookerName} · ${r.team_code || ''}</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="trav-meta"><span><b>${r.checkin_date} – ${r.checkout_date}</b></span><span class="dot"></span><span>${r.guests.length} คน · ${r.rooms} ห้อง</span></div>
    <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('hotel', 14)} ${r.hotel?.name || '-'}${r.branchHotelKm != null ? ' · ' + r.branchHotelKm + ' กม.จากสาขา' : ''}${dup}</div>
  </div>`;
}
// จัดกลุ่มผู้เข้าพักตามห้อง (room_no) ถ้ามีการระบุห้องไว้ — คำขอเก่าที่ยังไม่มี room_no เลย
// (ทุกคน room_no เป็น null) จะคืน null ให้ผู้เรียกกลับไปแสดงเป็นรายชื่อเรียบเหมือนเดิม
function groupGuestsByRoom(guests) {
  if (!guests.some((g) => g.room_no != null)) return null;
  const byRoom = new Map();
  const unassigned = [];
  guests.forEach((g) => {
    if (g.room_no == null) { unassigned.push(g); return; }
    if (!byRoom.has(g.room_no)) byRoom.set(g.room_no, []);
    byRoom.get(g.room_no).push(g);
  });
  const rooms = [...byRoom.entries()].sort((a, b) => a[0] - b[0]).map(([room_no, members]) => ({ room_no, members }));
  return { rooms, unassigned };
}
// ข้อความล้วนสำหรับก็อบวางในระบบ Choowap ตอนโทรจอง — จัดเป็นห้องๆ ถ้ามี room_no
function guestsCopyLines(r) {
  const grouped = groupGuestsByRoom(r.guests);
  if (!grouped) return `ผู้เข้าพัก: ${r.guests.map((g) => g.name).join(', ')}`;
  const lines = grouped.rooms.map((room) => {
    const genderTag = room.members[0]?.gender ? (room.members[0].gender === 'M' ? ' (ชาย)' : ' (หญิง)') : '';
    return `ห้อง ${room.room_no}${genderTag}: ${room.members.map((g) => g.name).join(', ')}`;
  });
  if (grouped.unassigned.length) lines.push(`ยังไม่ระบุห้อง: ${grouped.unassigned.map((g) => g.name).join(', ')}`);
  return lines.join('\n');
}
function guestCardHtml(g, r) {
  let pill = '<span class="pill pill-neutral">ไม่มีข้อมูลบ้านพนักงาน</span>';
  if (g.hasHomeCoords) pill = g.homeDistanceKm < 10 ? `<span class="pill pill-warning">บ้านห่างแค่ ${g.homeDistanceKm} กม.</span>` : `<span class="pill pill-neutral">บ้านห่าง ${g.homeDistanceKm} กม.</span>`;
  const dup = r.dupWarnings.find((d) => d.employee_code === g.employee_code);
  return `<div class="trav-card" style="cursor:default;">
      <div class="trav-top">${avatarHtml(g.name, 34, g.gender)}<div class="info"><h3>${g.name}</h3><div class="sub">${g.employee_code || 'เพิ่มใหม่'}${g.gender ? ' · ' + (g.gender === 'M' ? 'ชาย' : 'หญิง') : ''}</div></div>${dup ? '<span class="pill pill-danger">ชื่อซ้ำ</span>' : pill}</div>
      ${dup ? `<div class="trav-meta" style="border-top:none; padding-top:0; color:var(--danger);">อยู่ในคำขอ "${dup.conflictBranch} ${dup.conflictDates}" ด้วย</div>` : ''}
    </div>`;
}
function guestListHtml(r) {
  const grouped = groupGuestsByRoom(r.guests);
  if (!grouped) return `<div class="req-grid">${sortByGender(r.guests).map((g) => guestCardHtml(g, r)).join('')}</div>`;
  const roomBlocks = grouped.rooms.map((room) => {
    const genderTag = room.members[0]?.gender ? ' · ' + (room.members[0].gender === 'M' ? 'ชาย' : 'หญิง') : '';
    return `<div class="section-title" style="margin:10px 0 6px; font-size:12px;">ห้อง ${room.room_no}${genderTag}</div><div class="req-grid">${sortByGender(room.members).map((g) => guestCardHtml(g, r)).join('')}</div>`;
  }).join('');
  const unassignedBlock = grouped.unassigned.length
    ? `<div class="section-title" style="margin:10px 0 6px; font-size:12px;">ยังไม่ระบุห้อง</div><div class="req-grid">${sortByGender(grouped.unassigned).map((g) => guestCardHtml(g, r)).join('')}</div>`
    : '';
  return roomBlocks + unassignedBlock;
}
async function openApproverDetail(id) {
  const data = await api('/api/requests/' + id);
  const r = data.request;
  document.querySelector('[data-view="approver-queue-list"]').classList.remove('active');
  document.querySelector('[data-view="approver-detail-panel"]').classList.add('active');
  const guestsHtml = guestListHtml(r);
  let actions = '';
  if (r.status === 'pending') {
    actions = `<div class="note-box muted"><b>รอ AREA จองใน Choowap ก่อน</b>จะมาให้คุณอนุมัติหลัง AREA กด "จองแล้ว"</div>`;
  } else if (r.status === 'booked') {
    actions = `<div class="sticky-foot" id="approverActionBar">
      <button class="btn btn-danger" style="flex:1;" onclick="showRejectBox(${r.id})">${icon('undo', 16)} ตีกลับ (ให้ลองที่พักอื่น)</button>
      <button class="btn btn-success" style="flex:1.4;" onclick="approveRequest(${r.id})">${icon('check', 16)} อนุมัติ</button>
    </div>
    <div class="sticky-foot" id="rejectBox" style="display:none; flex-direction:column; gap:8px;">
      <textarea id="rejectReason" rows="2" placeholder="พิมพ์เหตุผล/หมายเหตุที่ส่งกลับ"></textarea>
      <div style="display:flex; gap:8px;">
        <button class="btn" style="flex:1;" onclick="hideRejectBox()">ยกเลิก</button>
        <button class="btn btn-danger" style="flex:1.6;" onclick="rejectRequest(${r.id})">ยืนยันตีกลับ</button>
      </div>
    </div>`;
  } else if (r.status === 'approved') {
    actions = `<div class="note-box success"><b>อนุมัติแล้ว</b>รอ AREA ยืนยันปิดงาน</div>`;
  } else if (r.status === 'done') {
    actions = `<div class="note-box success"><b>จองสำเร็จแล้ว</b>${r.confirmation_no ? `เลขยืนยัน <span class="num">${r.confirmation_no}</span>` : ''}${voucherHtml(r.voucher_url)}</div>`;
  } else if (r.status === 'rejected') {
    actions = `<div class="note-box danger"><b>ตีกลับแล้ว</b>${r.reject_reason || ''}</div>`;
  }
  // ลบคำขอทิ้งทั้งรายการ — ทำได้ทุกสถานะยกเว้น 'done' (จองสำเร็จมีวอยเชอร์จริงแล้ว ถือเป็นประวัติ)
  const deleteBtnHtml = r.status !== 'done'
    ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger); margin-top:8px;" onclick="deleteRequestFromApprover(${r.id})">${icon('x', 14)} ลบคำขอนี้ทิ้ง</button>`
    : '';
  const apChosen = ['booked', 'approved', 'done'].includes(r.status);
  const candidatesHtml = (!apChosen && (r.hotelCandidates || []).length > 1) ? `
    <div class="note-box muted" style="margin:10px 0;"><b>ที่พักที่เลือกไว้ (${r.hotelCandidates.length} อันดับ)</b>${r.hotelCandidates.map((h, i) => {
      const d = r.branch?.lat != null && h.lat != null ? haversineKm(r.branch.lat, r.branch.lng, h.lat, h.lng) : null;
      const far = d != null && r.hotelMaxKm != null && d > r.hotelMaxKm;
      return `<div style="margin-top:4px;">${i + 1}. ${h.name}${i === 0 ? ' (หลัก)' : ''}${d != null ? ` · ${d} กม.${far ? ' ' + icon('alert', 12) : ''}` : ''}</div>`;
    }).join('')}</div>` : '';
  const hotelHeadLabel = apChosen ? 'ที่พักที่จองไว้' : 'ที่พักอันดับ 1';
  el('approverDetailRoot').innerHTML = `
    <button class="back-link" onclick="closeApproverDetail()">‹ กลับไปคิว</button>
    <div class="page-head"><div><h2>${r.branch?.name || r.branch_code}</h2><div class="sub">${r.team_code || ''} · ${r.mission_type} · ${r.checkin_date} – ${r.checkout_date} (${r.nights} คืน)</div><div class="sub" style="margin-top:2px;">${icon('hotel', 13)} ${hotelHeadLabel}: <b style="color:var(--ink);">${r.hotel?.name || '-'}</b></div></div></div>
    <div class="trav-top" style="margin:10px 0;">${avatarHtml(r.createdByName, 30)}<div class="info"><h3 style="font-size:12.5px; color:var(--ink-faint); font-weight:600;">ผู้จองให้</h3><div class="sub" style="font-size:13.5px; color:var(--ink); font-weight:600;">${r.createdByName}</div></div></div>
    ${candidatesHtml}
    <div id="apMap" style="height:220px; border-radius:var(--r-lg); overflow:hidden; border:3px solid var(--ink); margin-bottom:10px;"></div>
    ${r.muster ? `<div class="note-box muted" style="margin:10px 0;"><b>ระยะทาง</b>จุดรวมพล (${r.muster.name}) → สาขา ${r.musterBranchKm ?? '-'} กม. · สาขา → ที่พัก ${r.branchHotelKm ?? '-'} กม. · รวม ${r.totalKm?.toFixed ? r.totalKm.toFixed(1) : r.totalKm} กม.</div>` : ''}
    ${r.muster_reason ? `<div class="note-box" style="margin:10px 0;"><b>หมายเหตุระยะทางจุดรวมพล</b>${r.muster_reason}</div>` : ''}
    <div class="section-title" style="margin-bottom:10px; display:block;">ผู้เข้าพัก (${r.guests.length} คน · ${r.rooms} ห้อง)</div>
    <div style="margin-bottom:18px;">${guestsHtml}</div>
    ${r.far_reason ? `<div class="note-box" style="margin-bottom:18px;"><b>เหตุผลเลือกที่พักนอกรัศมี</b>${r.far_reason}</div>` : ''}
    ${actions}
    ${deleteBtnHtml}`;
  renderApproverMap(r);
}
let apMapInstance = null;
async function fetchDrivingRoute(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const data = await fetch(url).then((r) => r.json());
    const route = data.routes && data.routes[0];
    if (!route) return null;
    return {
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      km: Math.round((route.distance / 1000) * 10) / 10,
      minutes: Math.round(route.duration / 60),
    };
  } catch (e) { return null; }
}
async function renderApproverMap(r) {
  const el2 = document.getElementById('apMap');
  if (!el2 || typeof L === 'undefined') return;
  if (apMapInstance) { apMapInstance.remove(); apMapInstance = null; }
  const points = [];
  if (r.muster && r.muster.lat != null) points.push({ lat: r.muster.lat, lng: r.muster.lng, label: 'จุดรวมพล: ' + r.muster.name, color: '#2CA6D8' });
  if (r.branch && r.branch.lat != null) points.push({ lat: r.branch.lat, lng: r.branch.lng, label: 'สาขา: ' + r.branch.name, color: '#FFC22B' });
  if (r.hotel && r.hotel.lat != null) points.push({ lat: r.hotel.lat, lng: r.hotel.lng, label: 'ที่พัก: ' + r.hotel.name, color: '#2FB24A' });
  if (!points.length) { el2.innerHTML = '<p class="empty-hint" style="padding-top:80px;">ไม่มีข้อมูลพิกัด</p>'; return; }
  apMapInstance = L.map('apMap', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(apMapInstance);
  points.forEach((p) => {
    L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 })
      .addTo(apMapInstance).bindTooltip(p.label, { permanent: false });
  });
  const straight = L.polyline(points.map((p) => [p.lat, p.lng]), { color: '#8B8E98', weight: 2, dashArray: '6 6' }).addTo(apMapInstance);
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  apMapInstance.fitBounds(bounds, { padding: [30, 30] });

  // ดึงเส้นทางขับรถจริงมาแทนเส้นตรง (ถ้าเรียกไม่สำเร็จ ใช้เส้นตรง+ระยะทางตรงเดิม)
  const legs = [];
  for (let i = 0; i < points.length - 1; i++) legs.push([points[i], points[i + 1]]);
  const routes = await Promise.all(legs.map(([a, b]) => fetchDrivingRoute(a, b)));
  const anyRoute = routes.some(Boolean);
  if (anyRoute) {
    straight.remove();
    routes.forEach((route, i) => {
      if (route) L.polyline(route.coords, { color: '#FF6A3D', weight: 4, opacity: 0.85 }).addTo(apMapInstance);
      else L.polyline([[legs[i][0].lat, legs[i][0].lng], [legs[i][1].lat, legs[i][1].lng]], { color: '#8B8E98', weight: 2, dashArray: '6 6' }).addTo(apMapInstance);
    });
    const totalKm = routes.reduce((s, r2) => s + (r2 ? r2.km : 0), 0);
    const totalMin = routes.reduce((s, r2) => s + (r2 ? r2.minutes : 0), 0);
    const legNames = points.slice(1).map((p, i) => p.label.split(': ')[0]);
    const legText = routes.map((r2, i) => `${legNames[i]}: ${r2 ? r2.km + ' กม. (~' + r2.minutes + ' นาที)' : 'ไม่พบเส้นทาง'}`).join(' · ');
    const routeBox = document.createElement('div');
    routeBox.className = 'note-box';
    routeBox.style.margin = '10px 0';
    routeBox.innerHTML = `<b>ระยะทางขับรถจริง (ตามถนน)</b>${legText}${legs.length > 1 ? ' · รวม ' + totalKm.toFixed(1) + ' กม. (~' + totalMin + ' นาที)' : ''}`;
    el2.insertAdjacentElement('afterend', routeBox);
  }
}
function showRejectBox() {
  el('approverActionBar').style.display = 'none';
  el('rejectBox').style.display = 'flex';
  el('rejectReason').focus();
}
function hideRejectBox() {
  el('rejectBox').style.display = 'none';
  el('approverActionBar').style.display = 'flex';
}
function closeApproverDetail() {
  document.querySelector('[data-view="approver-detail-panel"]').classList.remove('active');
  document.querySelector('[data-view="approver-queue-list"]').classList.add('active');
}
async function approveRequest(id) {
  await api('/api/requests/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', actor: session.employee.code }) });
  await loadApproverQueue(); await openApproverDetail(id);
}
async function rejectRequest(id) {
  const reason = el('rejectReason').value.trim();
  if (!reason) { el('rejectReason').style.borderColor = 'var(--danger)'; el('rejectReason').placeholder = 'ต้องพิมพ์เหตุผลก่อนถึงจะตีกลับได้'; return; }
  await api('/api/requests/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', actor: session.employee.code, reason }) });
  await loadApproverQueue(); await openApproverDetail(id);
}
async function deleteRequestFromApprover(id) {
  const ok = await confirmDialog('ลบคำขอนี้ทิ้งถาวร ข้อมูลผู้เข้าพักและการจองทั้งหมดในคำขอนี้จะหายไป ยืนยันลบ?');
  if (!ok) return;
  try {
    await api(`/api/requests/${id}?actor=${encodeURIComponent(session.employee.code)}`, { method: 'DELETE' });
  } catch (e) { await alertDialog(e.message); return; }
  await loadApproverQueue();
}

// ===== shared-stay analysis =====
let analysisData = { sameHotel: [], nearbyBranch: [] };
let analysisTab = 'sameHotel';
async function loadAnalysis() {
  analysisData = await api('/api/analysis');
  analysisTab = 'sameHotel';
  renderAnalysis();
}
function switchAnalysisTab(tab) { analysisTab = tab; renderAnalysis(); }
function renderAnalysis() {
  const totalSavings = analysisData.nearbyBranch.reduce((sum, s) => sum + Math.max(0, s.fuel.savings), 0);
  const totalRoomsSaved = [...analysisData.sameHotel, ...analysisData.nearbyBranch].reduce((sum, s) => sum + Math.max(0, s.roomsBefore - s.roomsAfter), 0);
  el('analysisStats').innerHTML = `
    <div class="snap"><div class="ic">${icon('hotel', 20)}</div><div class="tx"><b class="num">${analysisData.sameHotel.length}</b><span>รวมห้องได้ (ที่พักเดียวกันอยู่แล้ว)</span></div></div>
    <div class="snap"><div class="ic">${icon('pin', 20)}</div><div class="tx"><b class="num">${analysisData.nearbyBranch.length}</b><span>ควรย้ายมาพักที่เดียวกัน</span></div></div>
    <div class="snap"><div class="ic">${icon('bed', 20)}</div><div class="tx"><b class="num">${totalRoomsSaved}</b><span>ห้องที่ประหยัดได้ทั้งหมด</span></div></div>
    <div class="snap"><div class="ic">${icon('check', 20)}</div><div class="tx"><b class="num">${totalSavings.toLocaleString()}.-</b><span>ค่าน้ำมันประหยัดได้ (ประมาณ)</span></div></div>`;
  el('analysisTabs').innerHTML = `
    <div class="analysis-tab ${analysisTab === 'sameHotel' ? 'on' : ''}" onclick="switchAnalysisTab('sameHotel')">พักที่เดียวกันแล้ว รวมห้องได้ (${analysisData.sameHotel.length})</div>
    <div class="analysis-tab ${analysisTab === 'nearbyBranch' ? 'on' : ''}" onclick="switchAnalysisTab('nearbyBranch')">สาขาใกล้กัน ย้ายมาพักรวมได้ (${analysisData.nearbyBranch.length})</div>`;

  const list = el('analysisList');
  if (analysisTab === 'sameHotel') {
    list.innerHTML = analysisData.sameHotel.length ? analysisData.sameHotel.map(sameHotelCardHtml).join('')
      : emptyStateHtml('search', 'ยังไม่พบคู่ที่รวมห้องได้', 'ต้องมีสองแผนพักที่เดียวกัน วันทับซ้อนกัน และมีเศษเพศเดียวกันฝั่งละ 1 คน');
  } else {
    list.innerHTML = analysisData.nearbyBranch.length ? analysisData.nearbyBranch.map(nearbyBranchCardHtml).join('')
      : emptyStateHtml('search', 'ยังไม่พบคู่ที่ควรย้ายมาพักรวมกัน', 'ต้องมีสองแผนสาขาห่างกันไม่เกิน 10 กม. วันทับซ้อนกัน และมีเศษเพศเดียวกันฝั่งละ 1 คน');
  }
}
function planBoxHtml(p) { return `<div class="p"><b>${p.team || '-'} · ${p.branch}</b><span>${p.dates} · ${p.guests} คน · ${p.hotel || 'ยังไม่เลือกที่พัก'}</span></div>`; }
function sameHotelCardHtml(s) {
  return `<div class="pair-card">
    <div class="pair-plans">${planBoxHtml(s.a)}<div class="pair-vs">+</div>${planBoxHtml(s.b)}</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      <span class="pill pill-accent">พักที่ ${s.hotel} เหมือนกัน</span>
      <span class="pill pill-success">${icon('bed', 11)} ${s.roomsBefore} ห้อง → ${s.roomsAfter} ห้อง</span>
    </div>
    <p class="pair-note">ทั้งสองแผนพักที่เดียวกันและมีคนเพศเดียวกันเป็นเศษฝั่งละ 1 คน — จับคู่พักห้องเดียวกันได้เลย ประหยัด ${s.roomsBefore - s.roomsAfter} ห้อง</p>
  </div>`;
}
function nearbyBranchCardHtml(s) {
  return `<div class="pair-card">
    <div class="pair-plans">${planBoxHtml(s.a)}<div class="pair-vs">+</div>${planBoxHtml(s.b)}</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      <span class="pill pill-warning">สาขาห่างกัน ${s.branchKm} กม.</span>
      <span class="pill pill-success">${icon('bed', 11)} ${s.roomsBefore} ห้อง → ${s.roomsAfter} ห้อง</span>
      <span class="pill pill-accent">แนะนำพักที่ ${s.suggestedHotel}</span>
    </div>
    <div class="fuel-compare">
      <div class="side"><div class="lbl">พักแยกที่เดิม</div><div class="amt" style="color:var(--danger-deep);">${s.fuel.separateCost.toLocaleString()}.-</div></div>
      <div class="arrow">→</div>
      <div class="side"><div class="lbl">ย้ายมาพักรวม</div><div class="amt" style="color:var(--success-deep);">${s.fuel.combinedCost.toLocaleString()}.-</div></div>
    </div>
    ${s.fuel.savings > 0 ? `<div class="fuel-save">${icon('check', 13)} ประหยัดค่าน้ำมันได้ ~${s.fuel.savings.toLocaleString()} บาท (${s.fuel.ratePerKm} บาท/กม.)</div>` : `<p class="pair-note" style="text-align:center;">ระยะทางใกล้เคียงกัน ค่าน้ำมันไม่ต่างมาก แต่ยังประหยัดห้องได้</p>`}
    <p class="pair-note">มีคนเพศเดียวกันเป็นเศษฝั่งละ 1 คน วันที่ทับซ้อนกัน — ย้ายมาพักที่เดียวกันได้จริง ไม่ใช่แค่ใกล้กันเฉยๆ</p>
  </div>`;
}

// ===== dashboard =====
function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function fmtHours(ms) {
  const h = ms / 3600000;
  if (h < 1) return Math.round(ms / 60000) + ' นาที';
  if (h < 48) return h.toFixed(1) + ' ชม.';
  return (h / 24).toFixed(1) + ' วัน';
}
async function loadDashboard() {
  el('dashSubtitle').textContent = CATEGORY_LABEL[approverCategory] + ' · ทั้งหมดที่เคยส่งเข้ามา';
  const data = await api(`/api/requests?role=approver&category=${approverCategory}`);
  const reqs = data.requests.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const approvedOnes = reqs.filter((r) => r.approved_at);
  const avgApproveMs = approvedOnes.length ? approvedOnes.reduce((sum, r) => sum + (new Date(r.approved_at) - new Date(r.created_at)), 0) / approvedOnes.length : null;
  const leadTimes = reqs.map((r) => (new Date(r.checkin_date) - new Date(r.created_at)) / 86400000);
  const avgLeadDays = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;
  const bookedCount = reqs.filter((r) => r.status === 'booked').length;

  el('dashStats').innerHTML = `
    <div class="snap"><div class="ic">${icon('briefcase', 20)}</div><div class="tx"><b class="num">${reqs.length}</b><span>คำขอทั้งหมด</span></div></div>
    <div class="snap"><div class="ic">${icon('clock', 20)}</div><div class="tx"><b class="num">${bookedCount}</b><span>รออนุมัติตอนนี้</span></div></div>
    <div class="snap"><div class="ic">${icon('check', 20)}</div><div class="tx"><b class="num" style="font-size:15px;">${avgApproveMs != null ? fmtHours(avgApproveMs) : '-'}</b><span>เวลาเฉลี่ยที่ใช้อนุมัติ</span></div></div>
    <div class="snap"><div class="ic">${icon('calendar', 20)}</div><div class="tx"><b class="num" style="font-size:15px;">${avgLeadDays != null ? avgLeadDays.toFixed(1) + ' วัน' : '-'}</b><span>จองล่วงหน้าเฉลี่ย</span></div></div>`;

  el('dashTableBody').innerHTML = reqs.map((r) => {
    const leadDays = (new Date(r.checkin_date) - new Date(r.created_at)) / 86400000;
    const approveMs = r.approved_at ? new Date(r.approved_at) - new Date(r.created_at) : null;
    const [label, cls] = STATUS_LABEL[r.status];
    return `<tr style="border-top:1px solid var(--line);">
      <td style="padding:9px 12px;">${r.branch?.name || r.branch_code}</td>
      <td style="padding:9px 12px;">${r.createdByName || r.created_by}</td>
      <td style="padding:9px 12px;" class="num">${fmtDateTime(r.created_at)}</td>
      <td style="padding:9px 12px;" class="num">${fmtDateTime(r.approved_at)}</td>
      <td style="padding:9px 12px;" class="num">${approveMs != null ? fmtHours(approveMs) : '-'}</td>
      <td style="padding:9px 12px;" class="num" style="${leadDays < 2 ? 'color:var(--danger); font-weight:700;' : ''}">${leadDays.toFixed(1)} วัน</td>
      <td style="padding:9px 12px;"><span class="pill ${cls}">${label}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--ink-faint);">ยังไม่มีข้อมูล</td></tr>';
}

// ===== employee: ดูแผนของตัวเอง (auto-load ด้วยรหัสที่ล็อกอินไว้ ไม่ต้องพิมพ์ซ้ำ) =====
async function loadEmployeeView() {
  loadEmployeeSchedule();
  try {
    const data = await api('/api/employee-lookup?code=' + encodeURIComponent(session.employee.code));
    if (!data.requests.length) { el('empLookupResult').innerHTML = `<p class="empty-hint">คุณ${data.employee.nickname || data.employee.name} ยังไม่มีแผนที่พักในระบบ</p>`; return; }
    el('empLookupResult').innerHTML = `<p style="font-size:13px; color:var(--ink-soft);">สวัสดีคุณ${data.employee.nickname || data.employee.name}</p><div class="req-grid">` +
      data.requests.map((r) => `<div class="trav-card" onclick="openDetail(${r.id}, 'employee-view', true)">
        <div class="trav-top">${avatarHtml(r.branch?.name, 36)}<div class="info"><h3>${r.branch?.name}</h3><div class="sub">${r.branch?.province || ''}</div></div><span class="pill ${STATUS_LABEL[r.status][1]}">${STATUS_LABEL[r.status][0]}</span></div>
        <div class="trav-meta"><span>${r.checkin_date} – ${r.checkout_date}</span><span class="dot"></span><span>${r.nights} คืน</span></div>
        <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('hotel', 14)} ${r.hotel?.name || '-'}</div>
      </div>`).join('') + '</div>';
  } catch (e) {
    el('empLookupResult').innerHTML = errBox(e.message);
  }
}

// ===== admin data management =====
let adminStaffCache = [];
let adminStaffEditing = null; // { code, category } หรือ null = เพิ่มใหม่

async function loadAdminData() {
  await Promise.all([loadAdminStaff(), loadAdminBranchSummary(), loadAdminHotelSummary(), loadStaffSyncStatus()]);
}
function fmtSyncTime(iso) {
  if (!iso) return 'ยังไม่เคยซิงค์';
  const d = new Date(iso);
  return `ซิงค์ล่าสุด ${d.toLocaleDateString('th-TH')} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
}
async function loadStaffSyncStatus() {
  try {
    const s = await api('/api/admin/staff-sync-status?actor=' + encodeURIComponent(session.employee.code));
    el('staffSyncStatusText').textContent = s.error ? `ซิงค์ล้มเหลว: ${s.error}` : `${fmtSyncTime(s.at)} (${s.count ?? '-'} คน)`;
  } catch (e) { el('staffSyncStatusText').textContent = 'เช็คสถานะไม่สำเร็จ'; }
}
async function syncStaffNow() {
  el('staffSyncStatusText').textContent = 'กำลังซิงค์...';
  try {
    await api('/api/admin/staff-sync-now?actor=' + encodeURIComponent(session.employee.code), { method: 'POST' });
    await loadStaffSyncStatus();
    await loadAdminStaff();
  } catch (e) { el('staffSyncStatusText').textContent = 'ซิงค์ล้มเหลว: ' + e.message; }
}
async function loadAdminStaff() {
  try {
    const data = await api('/api/admin/staff?actor=' + encodeURIComponent(session.employee.code));
    adminStaffCache = data.staff;
  } catch (e) {
    adminStaffCache = [];
    el('adminStaffAcList').innerHTML = errBox(e.message);
    el('adminStaffAcList').style.display = 'block';
  }
}
function searchAdminStaff(qRaw) {
  const q = (qRaw || '').trim().toLowerCase();
  const cat = el('adminStaffCatFilter').value;
  const list = el('adminStaffAcList');
  if (!q) { list.style.display = 'none'; list.innerHTML = ''; return; }
  let rows = adminStaffCache;
  if (cat) rows = rows.filter((s) => s.category === cat);
  rows = rows.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.nickname || '').toLowerCase().includes(q) || (s.team_code || '').toLowerCase().includes(q)).slice(0, 25);
  list.innerHTML = rows.length
    ? rows.map((s) => `<div class="combo-item" onclick='openStaffForm(${JSON.stringify({ code: s.code, category: s.category })})'><span>${s.code} · ${s.name}${s.nickname ? ' (' + s.nickname + ')' : ''}</span><span class="meta">${s.team_code || '-'} · ${CATEGORY_LABEL[s.category] || s.category}</span></div>`).join('')
    : '<div class="combo-empty">ไม่พบพนักงาน</div>';
  list.style.display = 'block';
}
function openStaffForm(key) {
  adminStaffEditing = key;
  el('staffFormCard').style.display = 'flex';
  el('staffFormError').innerHTML = '';
  el('adminStaffAcList').style.display = 'none';
  el('adminStaffSearch').value = '';
  if (key) {
    const s = adminStaffCache.find((x) => x.code === key.code && x.category === key.category);
    el('staffFormTitle').textContent = 'แก้ไขพนักงาน: ' + s.name;
    el('sfCode').value = s.code; el('sfCode').disabled = true;
    el('sfCategory').value = s.category; el('sfCategory').disabled = true;
    el('sfName').value = s.name || ''; el('sfNickname').value = s.nickname || '';
    el('sfGender').value = s.gender || 'M'; el('sfTeamCode').value = s.team_code || '';
    el('sfRole').value = s.role || ''; el('sfPhone').value = s.phone || ''; el('sfProvince').value = s.province || '';
    el('sfAreaOwner').value = s.area_owner || '';
    el('staffDeleteBtn').style.display = '';
  } else {
    el('staffFormTitle').textContent = 'เพิ่มพนักงาน';
    ['sfCode', 'sfName', 'sfNickname', 'sfTeamCode', 'sfRole', 'sfPhone', 'sfProvince', 'sfAreaOwner'].forEach((id) => (el(id).value = ''));
    el('sfCode').disabled = false; el('sfCategory').disabled = false; el('sfCategory').value = 'activity'; el('sfGender').value = 'M';
    el('staffDeleteBtn').style.display = 'none';
  }
  el('staffFormCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeStaffForm() { el('staffFormCard').style.display = 'none'; adminStaffEditing = null; }
async function saveStaffForm() {
  const body = {
    code: el('sfCode').value.trim(), category: el('sfCategory').value,
    name: el('sfName').value.trim(), nickname: el('sfNickname').value.trim(),
    gender: el('sfGender').value, team_code: el('sfTeamCode').value.trim(),
    role: el('sfRole').value.trim(), phone: el('sfPhone').value.trim(), province: el('sfProvince').value.trim(),
    area_owner: el('sfAreaOwner').value.trim(),
  };
  el('staffFormError').innerHTML = '';
  try {
    if (adminStaffEditing) {
      await api(`/api/admin/staff/${encodeURIComponent(adminStaffEditing.code)}/${encodeURIComponent(adminStaffEditing.category)}?actor=${encodeURIComponent(session.employee.code)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      await api('/api/admin/staff?actor=' + encodeURIComponent(session.employee.code), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    closeStaffForm();
    loadAdminStaff();
  } catch (e) {
    el('staffFormError').innerHTML = errBox(e.message);
  }
}
async function deleteStaffForm() {
  if (!adminStaffEditing) return;
  if (!(await confirmDialog('ลบพนักงานคนนี้ออกจากระบบ?'))) return;
  try {
    await api(`/api/admin/staff/${encodeURIComponent(adminStaffEditing.code)}/${encodeURIComponent(adminStaffEditing.category)}?actor=${encodeURIComponent(session.employee.code)}`, { method: 'DELETE' });
    closeStaffForm();
    loadAdminStaff();
  } catch (e) {
    el('staffFormError').innerHTML = errBox(e.message);
  }
}

async function loadAdminBranchSummary() {
  try {
    const data = await api('/api/admin/branches?actor=' + encodeURIComponent(session.employee.code));
    const active = data.branches.filter((b) => b.is_active).length;
    el('adminBranchSummary').textContent = `ตอนนี้มี ${data.branches.length} สาขา (ใช้งานอยู่ ${active})`;
  } catch (e) { el('adminBranchSummary').innerHTML = errBox(e.message); }
}
async function loadAdminHotelSummary() {
  try {
    const data = await api('/api/admin/hotels?actor=' + encodeURIComponent(session.employee.code));
    el('adminHotelSummary').textContent = `ตอนนี้มี ${data.hotels.length} ที่พัก`;
  } catch (e) { el('adminHotelSummary').innerHTML = errBox(e.message); }
}
async function uploadAdminFile(kind) {
  const inputId = kind === 'branch' ? 'adminBranchFile' : 'adminHotelFile';
  const msgId = kind === 'branch' ? 'adminBranchMsg' : 'adminHotelMsg';
  const endpoint = kind === 'branch' ? '/api/admin/import-branches' : '/api/admin/import-hotels';
  const file = el(inputId).files[0];
  if (!file) { el(msgId).innerHTML = errBox('เลือกไฟล์ก่อน'); return; }
  el(msgId).textContent = 'กำลังนำเข้า...';
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch(endpoint + '?actor=' + encodeURIComponent(session.employee.code), { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'นำเข้าไม่สำเร็จ');
    el(msgId).innerHTML = `<span style="color:var(--success);">นำเข้าสำเร็จ ${data.count} รายการ</span>`;
    el(inputId).value = '';
    if (kind === 'branch') loadAdminBranchSummary(); else loadAdminHotelSummary();
  } catch (e) {
    el(msgId).innerHTML = errBox(e.message);
  }
}

async function uploadScheduleFile() {
  const file = el('adminScheduleFile').files[0];
  const month = el('adminScheduleMonth').value.trim();
  if (!month) { el('adminScheduleMsg').innerHTML = errBox('ใส่เดือนของไฟล์ก่อน เช่น 2026-09'); return; }
  if (!file) { el('adminScheduleMsg').innerHTML = errBox('เลือกไฟล์ก่อน'); return; }
  el('adminScheduleMsg').textContent = 'กำลังนำเข้า...';
  const fd = new FormData(); fd.append('file', file); fd.append('source_month', month);
  try {
    const r = await fetch('/api/admin/import-schedule?actor=' + encodeURIComponent(session.employee.code), { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'นำเข้าไม่สำเร็จ');
    el('adminScheduleMsg').innerHTML = `<span style="color:var(--success);">นำเข้าสำเร็จ ${data.count} รายการ${data.skippedUnknownTeam ? ` (ข้าม ${data.skippedUnknownTeam} แถว หาทีมไม่เจอ)` : ''}</span>`;
    el('adminScheduleFile').value = '';
  } catch (e) {
    el('adminScheduleMsg').innerHTML = errBox(e.message);
  }
}

async function deleteAllScheduleEntries() {
  if (!(await confirmDialog('ลบแผนงานทั้งหมดในระบบ? ลบแล้วกู้คืนไม่ได้ ต้องนำเข้าไฟล์ใหม่อีกครั้ง'))) return;
  try {
    await api('/api/admin/schedule-entries?actor=' + encodeURIComponent(session.employee.code), { method: 'DELETE' });
    alertDialog('ลบแผนงานทั้งหมดแล้ว');
  } catch (e) {
    alertDialog(e.message);
  }
}
async function deleteAllRequests() {
  if (!(await confirmDialog('ลบคำขอจองทั้งหมดในระบบ (รวมผู้เข้าพักทุกคน)? ลบแล้วกู้คืนไม่ได้'))) return;
  el('adminDeleteRequestsMsg').textContent = 'กำลังลบ...';
  try {
    await api('/api/admin/requests-all?actor=' + encodeURIComponent(session.employee.code), { method: 'DELETE' });
    el('adminDeleteRequestsMsg').innerHTML = '<span style="color:var(--success);">ลบคำขอจองทั้งหมดแล้ว</span>';
  } catch (e) {
    el('adminDeleteRequestsMsg').innerHTML = errBox(e.message);
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo')) document.querySelectorAll('.combo-list').forEach((l) => (l.style.display = 'none'));
});
showView('login');
