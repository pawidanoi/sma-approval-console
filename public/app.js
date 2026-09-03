// ===== state =====
let session = null;
let currentRole = null;   // 'booker' | 'approver' | 'employee'
let approverCategory = null;
let form = {
  category: null, missionType: null, teamCode: null,
  musterPoints: [], chosenMuster: null,
  branch: null, musterCheck: null, hotelMaxKm: null,
  selectedHotel: null, guests: [],
};
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
function sortByGender(guests) {
  return guests.map((g, i) => [g, i]).sort((a, b) => (GENDER_RANK[a[0].gender] ?? 2) - (GENDER_RANK[b[0].gender] ?? 2) || a[1] - b[1]).map((pair) => pair[0]);
}
function avatarPair(seed) { let h = 0; for (const c of String(seed || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function avatarHtml(name, size, gender) {
  const initial = (name || '?').trim()[0] || '?';
  const c1 = GENDER_COLORS[gender] || avatarPair(name)[0];
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
  const tabs = { booker: [['booker-home', 'แผนของฉัน'], ['booker-form', 'สร้างคำขอจอง']], approver: [['approver-queue', 'คิวรออนุมัติ'], ['analysis', 'วิเคราะห์รวม'], ['dashboard', 'แดชบอร์ด'], ['admin-data', 'จัดการข้อมูล']], employee: [['employee-view', 'ค้นหาแผน']] };
  const tb = el('tabbar'); tb.innerHTML = '';
  tabs[role].forEach(([id, label], i) => {
    const b = document.createElement('button');
    b.className = 'tabbtn' + (i === 0 ? ' on' : '');
    b.textContent = label; b.dataset.view = id;
    b.onclick = () => { showView(id); if (id === 'booker-home') loadBookerHome(); if (id === 'approver-queue') loadApproverQueue(); if (id === 'dashboard') loadDashboard(); if (id === 'analysis') loadAnalysis(); if (id === 'admin-data') loadAdminData(); };
    tb.appendChild(b);
  });
  showView(tabs[role][0][0]);
  if (role === 'booker') loadBookerHome();
  if (role === 'approver') loadApproverQueue();
}
function logout() {
  session = null; currentRole = null; approverCategory = null;
  el('whoBox').style.visibility = 'hidden'; el('tabbar').innerHTML = ''; el('loginCode').value = '';
  showView('login');
}

// ===== booker home =====
const STATUS_LABEL = {
  pending: ['รออนุมัติ', 'pill-warning'], approved: ['อนุมัติแล้ว รอจอง', 'pill-accent'],
  done: ['จองสำเร็จ', 'pill-success'], rejected: ['ตีกลับ', 'pill-danger'],
};
async function loadBookerHome() {
  const data = await api('/api/requests?actor=' + encodeURIComponent(session.employee.code));
  const reqs = data.requests;
  const counts = { pending: 0, approved: 0, done: 0, rejected: 0 };
  reqs.forEach((r) => counts[r.status]++);
  el('bookerStats').innerHTML = `
    <div class="snap"><div class="ic">${icon('clock', 20)}</div><div class="tx"><b class="num">${counts.pending}</b><span>รออนุมัติ</span></div></div>
    <div class="snap"><div class="ic">${icon('package', 20)}</div><div class="tx"><b class="num">${counts.approved}</b><span>อนุมัติแล้ว รอจอง</span></div></div>
    <div class="snap"><div class="ic">${icon('check', 20)}</div><div class="tx"><b class="num">${counts.done}</b><span>จองสำเร็จ</span></div></div>
    <div class="snap"><div class="ic">${icon('undo', 20)}</div><div class="tx"><b class="num">${counts.rejected}</b><span>ถูกตีกลับ</span></div></div>`;
  el('bookerReqList').innerHTML = reqs.length
    ? '<div class="req-grid">' + reqs.map(bookerCardHtml).join('') + '</div>'
    : emptyStateHtml('suitcase', 'ยังไม่มีคำขอจอง', 'กด "สร้างคำขอจอง" เพื่อเริ่มรายการแรกของคุณ');
}
function bookerCardHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  return `<div class="trav-card" onclick="openDetail(${r.id}, 'booker-home', false)">
    <div class="trav-top">${avatarHtml(r.team_code || r.branch?.name, 36)}<div class="info"><h3>${r.branch?.name || r.branch_code}</h3><div class="sub">${r.branch?.province || ''} · ${r.team_code || ''}</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="trav-meta"><span>${icon('calendar', 14)} <b>${r.checkin_date} – ${r.checkout_date}</b></span><span class="dot"></span><span>${icon('moon', 14)} ${r.nights} คืน</span><span class="dot"></span><span>${icon('users', 14)} ${r.guests.length} คน · ${r.rooms} ห้อง</span></div>
    <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('hotel', 14)} <b>${r.hotel?.name || '-'}</b>${r.status === 'rejected' && r.reject_reason ? ' · เหตุผล: ' + r.reject_reason : ''}${r.status === 'done' && r.confirmation_no ? ' · เลข ' + r.confirmation_no : ''}</div>
  </div>`;
}

// ===== booker form =====
function resetForm() {
  form = { category: null, missionType: null, teamCode: null, musterPoints: [], chosenMuster: null, branch: null, musterCheck: null, hotelMaxKm: null, selectedHotel: null, guests: [] };
  el('formError').innerHTML = '';
  el('fBranchSearch').value = ''; el('fBranchChosen').innerHTML = '';
  el('fCheckin').value = ''; el('fCheckout').value = '';
  el('teamChosen').innerHTML = '<span style="color:var(--ink-faint); font-weight:500;">เลือกทีม...</span>';
  el('musterPointBox').innerHTML = ''; el('musterCheckBox').innerHTML = '';
  el('guestSearch').value = ''; el('guestChipRow').innerHTML = '';
  el('otherTeamBox').style.display = 'none'; el('teamRosterList').style.display = 'none'; el('guestAcList').style.display = 'none';
  ['branchStepCard', 'hotelStepCard', 'dateStepCard', 'guestStepCard'].forEach((id) => (el(id).style.display = 'none'));
  el('nearHotelsList').innerHTML = ''; el('farHotelsList').innerHTML = ''; el('farHotelsList').style.display = 'none';
  el('farReasonBox').style.display = 'none'; el('distanceMapBox').innerHTML = '';

  const bookerCats = session.roleOptions.filter((r) => r.role === 'booker').map((r) => r.category);
  const seg = el('teamCatSeg');
  if (bookerCats.length <= 1) {
    form.category = bookerCats[0] || 'activity';
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
  const data = await api('/api/teams?category=' + form.category);
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
  const data = await api(`/api/hotels-near?branch=${encodeURIComponent(form.branch.code)}&category=${form.category}`);
  form.hotelMaxKm = data.hotelMaxKm;
  el('nearHotelsList').innerHTML = data.near.map(hotelRowHtml).join('') || `<p class="empty-hint">ไม่พบที่พักในรัศมี ${data.hotelMaxKm} กม. ลองดูที่พักไกลกว่านี้</p>`;
  el('farHotelsList').innerHTML = data.far.map(hotelRowHtml).join('');
}
function hotelRowHtml(h) {
  const far = h.distance_km > form.hotelMaxKm;
  const selected = form.selectedHotel && form.selectedHotel.code === h.code;
  return `<div class="hotel-row" onclick='selectHotel(${JSON.stringify(h)})'>
    <div class="radio ${selected ? 'on' : ''}" style="${far ? 'border-color:var(--warning);' : ''}"></div>
    <div style="flex:1;"><div class="hotel-name">${h.name}</div>
      <div class="hotel-sub" style="${far ? 'color:var(--warning); font-weight:600;' : ''}">
        <span>${far ? icon('alert', 13) + ' ' : ''}${h.distance_km} กม. จากสาขา</span>
        ${h.map_link ? `<a href="${h.map_link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icon('pin', 13)} ดูรีวิว</a>` : ''}
      </div></div>
    <div class="hotel-price">${h.price_per_night ?? '-'}.-</div>
  </div>`;
}
function selectHotel(h) {
  form.selectedHotel = h;
  loadHotels();
  el('farReasonBox').style.display = h.distance_km > form.hotelMaxKm ? 'block' : 'none';
  renderDistanceMap();
  el('dateStepCard').style.display = 'flex';
  checkDatesReady();
}
function renderDistanceMap() {
  const m = form.chosenMuster, b = form.branch, h = form.selectedHotel;
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

// ===== guests: click-to-add from own team roster, or search another team =====
function isGuestSelected(code) { return form.guests.some((g) => g.employee_code === code); }

async function openTeamRosterList() {
  const list = el('teamRosterList');
  if (list.style.display === 'block') { list.style.display = 'none'; return; }
  const data = await api(`/api/staff?category=${form.category}&team=${encodeURIComponent(form.teamCode)}`);
  renderStaffList(list, data.staff);
  list.style.display = 'block';
}
function toggleOtherTeamSearch() {
  const box = el('otherTeamBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') el('guestSearch').focus();
}
async function searchGuests(q) {
  const params = new URLSearchParams({ category: form.category, q: q || '' });
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
  form.guests.push({ employee_code: staff.code, name: staff.name, phone: staff.phone, gender: staff.gender, nickname: staff.nickname });
  el('guestSearch').value = ''; el('guestAcList').style.display = 'none'; el('teamRosterList').style.display = 'none';
  renderGuestChips();
}
function removeGuest(idx) { form.guests.splice(idx, 1); renderGuestChips(); }
function showAddGuestForm() { el('addGuestForm').style.display = 'flex'; }
function addNewGuest() {
  const name = el('newGuestName').value.trim();
  if (!name) return;
  form.guests.push({ employee_code: null, name, phone: el('newGuestPhone').value.trim() || null, gender: el('newGuestGender').value });
  el('newGuestName').value = ''; el('newGuestPhone').value = ''; el('addGuestForm').style.display = 'none';
  renderGuestChips();
}
function renderGuestChips() {
  el('guestChipRow').innerHTML = form.guests.map((g, i) => `
    <div class="guest-chip">${avatarHtml(g.name, 22, g.gender)}${g.name}${g.nickname ? ' (' + g.nickname + ')' : ''}${!g.employee_code ? ' <span class="new-tag">ใหม่</span>' : ''}<span class="x" onclick="removeGuest(${i})">${icon('x', 12)}</span></div>`
  ).join('');
  updateGuestSummary();
}
function updateGuestSummary() {
  const box = el('guestSummary');
  if (!form.guests.length) { box.style.display = 'none'; return; }
  const male = form.guests.filter((g) => g.gender === 'M').length;
  const female = form.guests.filter((g) => g.gender === 'F').length;
  const rooms = Math.ceil(male / 2) + Math.ceil(female / 2);
  box.style.display = 'block';
  box.innerHTML = `<b>${form.guests.length} คน</b> (ชาย ${male} · หญิง ${female}) → ใช้ ${rooms} ห้อง`;
}

async function submitRequest() {
  el('formError').innerHTML = '';
  if (!form.guests.length) {
    el('formError').innerHTML = errBox('ต้องมีผู้เข้าพักอย่างน้อย 1 คน');
    return;
  }
  const body = {
    team_category: form.category, mission_type: form.missionType, team_code: form.teamCode,
    muster_name: form.chosenMuster?.muster_name || null,
    muster_reason: el('fMusterReason')?.value.trim() || null,
    branch_code: form.branch?.code,
    checkin_date: el('fCheckin').value, checkout_date: el('fCheckout').value,
    hotel_code: form.selectedHotel?.code,
    far_reason: el('fFarReason').value.trim() || null,
    created_by: session.employee.code, guests: form.guests,
  };
  try {
    el('submitBtn').disabled = true;
    await api('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showView('booker-home'); loadBookerHome();
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
function detailHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  let gate = '';
  if (detailCtx.readonly) {
    gate = r.status === 'done' ? `<div class="note-box success"><b>จองสำเร็จแล้ว</b>เลขยืนยัน <span class="num">${r.confirmation_no}</span></div>` : `<div class="note-box muted"><b>ยังไม่จองสำเร็จ</b>ดูได้อย่างเดียว</div>`;
  } else if (r.status === 'approved') {
    gate = `<button class="btn btn-success btn-block" onclick="openComplete(${r.id})">${icon('check', 16)} จองใน Choowap เสร็จแล้ว → กรอกเลขยืนยัน</button>`;
  } else if (r.status === 'done') {
    gate = `<div class="note-box success"><b>จองสำเร็จแล้ว</b>เลขยืนยัน <span class="num">${r.confirmation_no}</span></div>`;
  } else if (r.status === 'rejected') {
    gate = `<div class="note-box danger"><b>ถูกตีกลับ</b>${r.reject_reason || ''}</div>`;
  } else {
    gate = `<div class="note-box muted"><b>ยังกดจองสำเร็จไม่ได้</b>ต้องรอผู้อนุมัติกดอนุมัติก่อน</div>`;
  }
  const kv = (icon, k, v) => `<div class="kv"><div class="ic">${icon}</div><div class="tx"><span class="k">${k}</span><span class="v">${v}</span></div></div>`;
  const sortedGuests = sortByGender(r.guests);
  const personBlocks = sortedGuests.map((g, i) => `
    <div class="person-block">
      <div class="person-head">${avatarHtml(g.name, 26, g.gender)}<b>คนที่ ${i + 1}${g.gender ? ' · ' + (g.gender === 'M' ? 'ชาย' : 'หญิง') : ''}</b></div>
      <div class="person-field"><div><span class="k">รหัสพนักงาน</span><span class="v">${g.employee_code || '-'}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.employee_code || '-')}, this)'>${icon('copy', 14)}</button></div>
      <div class="person-field"><div><span class="k">ชื่อ-นามสกุล</span><span class="v" style="font-family:inherit;">${g.name}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.name)}, this)'>${icon('copy', 14)}</button></div>
      <div class="person-field"><div><span class="k">เบอร์โทร</span><span class="v">${g.phone || '-'}</span></div><button class="btn btn-sm" onclick='copyText(${JSON.stringify(g.phone || '-')}, this)'>${icon('copy', 14)}</button></div>
    </div>`).join('');
  return `
    <button class="back-link" onclick="showView('${detailCtx.backTarget}')">‹ กลับ</button>
    <div class="page-head"><div><h2>รายละเอียดการจอง</h2><div class="sub">ใช้หน้านี้ก็อบข้อมูลไปกรอกจองในระบบ Choowap</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="copy-block">
      <div class="copy-head"><span>ข้อมูลที่พัก / ทริป</span><button class="btn btn-sm" onclick='copyText(${JSON.stringify(`ประเภทงาน: ${r.mission_type}\nทีม: ${r.team_code}\nสาขา: ${r.branch?.name}\nที่พัก: ${r.hotel?.name}\nเข้าพัก: ${r.checkin_date}\nเช็คเอาท์: ${r.checkout_date}\nจำนวนคืน: ${r.nights}\nจำนวนคน: ${r.guests.length}\nจำนวนห้อง: ${r.rooms}`)}, this)'>${icon('copy', 14)} ก็อบปี้</button></div>
      <div class="kv-grid">
        ${kv(icon('briefcase', 16), 'ประเภทงาน', r.mission_type)}
        ${kv(icon('users', 16), 'ทีม', r.team_code || '-')}
        ${kv(icon('pin', 16), 'สาขาที่ไป', (r.branch?.name || '') + ', ' + (r.branch?.province || ''))}
        ${kv(icon('hotel', 16), 'ที่พัก', r.hotel?.name || '-')}
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
async function openComplete(id) {
  const data = await api('/api/requests/' + id);
  const r = data.request;
  el('completeRoot').innerHTML = `
    <button class="back-link" onclick="openDetail(${id}, '${detailCtx.backTarget}', false); showView('booking-detail');">‹ กลับไปรายละเอียดการจอง</button>
    <div class="card" style="border-color:var(--success); background:var(--success-soft); display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:2px;">
        ${EMPTY_ILLUSTRATIONS.allDone}
        <div class="section-title" style="color:var(--success-deep);">เกือบเสร็จแล้ว — กรอกเลขยืนยันปิดงาน</div>
        <p style="font-size:12.5px; color:var(--ink-soft); margin:0;">${r.branch?.name} · ${r.hotel?.name} · ${r.checkin_date} – ${r.checkout_date}</p>
      </div>
      <div><span class="field-label">เลขยืนยันจากโรงแรม *</span><input type="text" id="confirmNo" placeholder="เช่น RSV-88213" style="border-color:var(--success);"></div>
      <div id="completeError"></div>
      <button class="btn btn-success btn-block" onclick="submitComplete(${id})">บันทึกจองสำเร็จ</button>
    </div>`;
  showView('booking-complete');
}
async function submitComplete(id) {
  const confirmation_no = el('confirmNo').value.trim();
  try {
    await api('/api/requests/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', actor: session.employee.code, confirmation_no }) });
    showView(detailCtx.backTarget === 'approver-queue' ? 'approver-queue' : 'booker-home');
    if (currentRole === 'booker') loadBookerHome();
    if (currentRole === 'approver') loadApproverQueue();
  } catch (e) {
    el('completeError').innerHTML = errBox(e.message);
  }
}

// ===== approver =====
async function loadApproverQueue() {
  el('approverSubtitle').textContent = CATEGORY_LABEL[approverCategory];
  const data = await api(`/api/requests?role=approver&category=${approverCategory}`);
  const reqs = data.requests.sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  el('approverPendingCount').textContent = reqs.filter((r) => r.status === 'pending').length;
  el('approverList').innerHTML = reqs.length ? reqs.map(approverCardHtml).join('') : emptyStateHtml('allDone', 'ไม่มีคำขอค้างอยู่', 'คำขอใหม่จะมาปรากฏที่นี่');
  el('approverDetailRoot').innerHTML = '<p class="empty-hint" style="padding:60px 20px;">เลือกคำขอทางซ้ายเพื่อดูรายละเอียด</p>';
  document.querySelector('[data-view="approver-queue-list"]').classList.add('active');
  document.querySelector('[data-view="approver-detail-panel"]').classList.remove('active');
}
function approverCardHtml(r) {
  const [label, cls] = STATUS_LABEL[r.status];
  const dup = r.dupWarnings.length ? `<span class="pill pill-danger" style="margin-left:6px;">ชื่อซ้ำ</span>` : '';
  return `<div class="trav-card" onclick="openApproverDetail(${r.id})">
    <div class="trav-top">${avatarHtml(r.team_code || r.branch?.name, 36)}<div class="info"><h3>${r.branch?.name || r.branch_code}</h3><div class="sub">${r.branch?.province || ''} · ${r.team_code || ''}</div></div><span class="pill ${cls}">${label}</span></div>
    <div class="trav-meta"><span><b>${r.checkin_date} – ${r.checkout_date}</b></span><span class="dot"></span><span>${r.guests.length} คน · ${r.rooms} ห้อง</span></div>
    <div class="trav-meta" style="border-top:none; padding-top:0;">${icon('hotel', 14)} ${r.hotel?.name || '-'}${r.branchHotelKm != null ? ' · ' + r.branchHotelKm + ' กม.จากสาขา' : ''}${dup}</div>
  </div>`;
}
async function openApproverDetail(id) {
  const data = await api('/api/requests/' + id);
  const r = data.request;
  document.querySelector('[data-view="approver-queue-list"]').classList.remove('active');
  document.querySelector('[data-view="approver-detail-panel"]').classList.add('active');
  const guestsHtml = sortByGender(r.guests).map((g) => {
    let pill = '<span class="pill pill-neutral">ไม่มีข้อมูลบ้านพนักงาน</span>';
    if (g.hasHomeCoords) pill = g.homeDistanceKm < 10 ? `<span class="pill pill-warning">บ้านห่างแค่ ${g.homeDistanceKm} กม.</span>` : `<span class="pill pill-neutral">บ้านห่าง ${g.homeDistanceKm} กม.</span>`;
    const dup = r.dupWarnings.find((d) => d.employee_code === g.employee_code);
    return `<div class="trav-card" style="cursor:default;">
      <div class="trav-top">${avatarHtml(g.name, 34, g.gender)}<div class="info"><h3>${g.name}</h3><div class="sub">${g.employee_code || 'เพิ่มใหม่'}${g.gender ? ' · ' + (g.gender === 'M' ? 'ชาย' : 'หญิง') : ''}</div></div>${dup ? '<span class="pill pill-danger">ชื่อซ้ำ</span>' : pill}</div>
      ${dup ? `<div class="trav-meta" style="border-top:none; padding-top:0; color:var(--danger);">อยู่ในคำขอ "${dup.conflictBranch} ${dup.conflictDates}" ด้วย</div>` : ''}
    </div>`;
  }).join('');
  let actions = '';
  if (r.status === 'pending') {
    actions = `<div class="sticky-foot" id="approverActionBar">
      <button class="btn btn-danger" style="flex:1;" onclick="showRejectBox(${r.id})">${icon('undo', 16)} ตีกลับ</button>
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
    actions = `<button class="btn btn-success btn-block" onclick="openDetail(${r.id}, 'approver-queue', false); showView('booking-detail');">→ ไปหน้ารายละเอียดการจอง</button>`;
  } else if (r.status === 'done') {
    actions = `<div class="note-box success"><b>จองสำเร็จแล้ว</b>เลขยืนยัน <span class="num">${r.confirmation_no}</span></div>`;
  } else if (r.status === 'rejected') {
    actions = `<div class="note-box danger"><b>ตีกลับแล้ว</b>${r.reject_reason || ''}</div>`;
  }
  el('approverDetailRoot').innerHTML = `
    <button class="back-link" onclick="closeApproverDetail()">‹ กลับไปคิว</button>
    <div class="page-head"><div><h2>${r.branch?.name || r.branch_code}</h2><div class="sub">${r.team_code || ''} · ${r.mission_type} · ${r.checkin_date} – ${r.checkout_date} (${r.nights} คืน)</div></div></div>
    <div class="trav-top" style="margin:10px 0;">${avatarHtml(r.createdByName, 30)}<div class="info"><h3 style="font-size:12.5px; color:var(--ink-faint); font-weight:600;">ผู้จองให้</h3><div class="sub" style="font-size:13.5px; color:var(--ink); font-weight:600;">${r.createdByName}</div></div></div>
    <div id="apMap" style="height:220px; border-radius:var(--r-lg); overflow:hidden; border:3px solid var(--ink); margin-bottom:10px;"></div>
    ${r.muster ? `<div class="note-box muted" style="margin:10px 0;"><b>ระยะทาง</b>จุดรวมพล (${r.muster.name}) → สาขา ${r.musterBranchKm ?? '-'} กม. · สาขา → ที่พัก ${r.branchHotelKm ?? '-'} กม. · รวม ${r.totalKm?.toFixed ? r.totalKm.toFixed(1) : r.totalKm} กม.</div>` : ''}
    ${r.muster_reason ? `<div class="note-box" style="margin:10px 0;"><b>หมายเหตุระยะทางจุดรวมพล</b>${r.muster_reason}</div>` : ''}
    <div class="section-title" style="margin-bottom:10px; display:block;">ผู้เข้าพัก (${r.guests.length} คน · ${r.rooms} ห้อง)</div>
    <div class="req-grid" style="margin-bottom:18px;">${guestsHtml}</div>
    ${r.far_reason ? `<div class="note-box" style="margin-bottom:18px;"><b>เหตุผลเลือกที่พักนอกรัศมี</b>${r.far_reason}</div>` : ''}
    ${actions}`;
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

// ===== shared-stay analysis =====
async function loadAnalysis() {
  const data = await api('/api/analysis');
  const list = el('analysisList');
  if (!data.suggestions.length) {
    list.innerHTML = '<p class="empty-hint">ยังไม่พบแผนที่วันซ้อนกันและอยู่ใกล้กันหรือใช้ที่พักเดียวกัน</p>';
    return;
  }
  list.innerHTML = data.suggestions.map((s) => {
    const badges = [];
    if (s.sameHotel) badges.push('<span class="pill pill-accent">เลือกที่พักเดียวกันอยู่แล้ว</span>');
    if (s.nearbyBranch) badges.push(`<span class="pill pill-warning">สาขาห่างกัน ${s.branchKm} กม.</span>`);
    if (s.roomShare) badges.push('<span class="pill pill-success">มีเศษเพศเดียวกัน รวมห้องได้</span>');
    return `<div class="pair-card">
      <div class="pair-plans">
        <div class="p"><b>${s.a.team || '-'} · ${s.a.branch}</b><span>${s.a.dates} · ${s.a.hotel || 'ยังไม่เลือกที่พัก'}</span></div>
        <div class="pair-vs">+</div>
        <div class="p"><b>${s.b.team || '-'} · ${s.b.branch}</b><span>${s.b.dates} · ${s.b.hotel || 'ยังไม่เลือกที่พัก'}</span></div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">${badges.join('')}</div>
      <p class="pair-note">${s.roomShare ? 'ทั้งสองแผนพักที่เดียวกันและมีคนเพศเดียวกันเป็นเศษฝั่งละ 1 คน — ลองจับคู่พักห้องเดียวกัน ประหยัดได้ 1 ห้อง' : s.sameHotel ? 'ทั้งสองแผนเลือกที่พักเดียวกันและวันที่ทับซ้อนกัน' : 'สาขาทั้งสองอยู่ใกล้กันและวันที่ทับซ้อนกัน ลองพิจารณาใช้ที่พักเดียวกัน'}</p>
    </div>`;
  }).join('');
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
  const pendingCount = reqs.filter((r) => r.status === 'pending').length;

  el('dashStats').innerHTML = `
    <div class="snap"><div class="ic">${icon('briefcase', 20)}</div><div class="tx"><b class="num">${reqs.length}</b><span>คำขอทั้งหมด</span></div></div>
    <div class="snap"><div class="ic">${icon('clock', 20)}</div><div class="tx"><b class="num">${pendingCount}</b><span>รออนุมัติตอนนี้</span></div></div>
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

// ===== employee lookup =====
async function lookupEmployee() {
  const code = el('empLookupCode').value.trim();
  if (!code) return;
  try {
    const data = await api('/api/employee-lookup?code=' + encodeURIComponent(code));
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
  await Promise.all([loadAdminStaff(), loadAdminBranchSummary(), loadAdminHotelSummary()]);
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
    el('staffDeleteBtn').style.display = '';
  } else {
    el('staffFormTitle').textContent = 'เพิ่มพนักงาน';
    ['sfCode', 'sfName', 'sfNickname', 'sfTeamCode', 'sfRole', 'sfPhone', 'sfProvince'].forEach((id) => (el(id).value = ''));
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
  if (!confirm('ลบพนักงานคนนี้ออกจากระบบ?')) return;
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

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo')) document.querySelectorAll('.combo-list').forEach((l) => (l.style.display = 'none'));
});
showView('login');
