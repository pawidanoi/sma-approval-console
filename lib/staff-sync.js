// ซิงค์รายชื่อพนักงาน "สายกิจกรรม" อัตโนมัติจากชีต HR (Google Sheets, เปิดดูสาธารณะ)
// อัพเดตเฉพาะ code/name/nickname/gender/team_code/phone/province/area_owner ของแต่ละคน
// "ไม่แตะ" role และ home_lat/home_lng — เพราะเป็นข้อมูลที่ระบบนี้ดูแลเอง ไม่ได้มาจาก HR
const { supabase } = require('./supabase');

const SHEET_ID = '1ME9-ibHGGdo94RjbXA2v69NKbF_27x87TCu2vGGlLzo';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function norm(s) { const v = (s || '').trim(); return v ? v : null; }

// ชื่อเล่นในชีตมีเพศต่อท้าย เช่น "ออย ญ" / "แบงค์ ช" — แยกออกมา
function splitNicknameGender(raw) {
  const s = norm(raw);
  if (!s) return { nickname: null, gender: null };
  const m = s.match(/^(.*?)\s+(ญ|ช)$/);
  if (m) return { nickname: m[1].trim() || null, gender: m[2] === 'ญ' ? 'F' : 'M' };
  return { nickname: s, gender: null };
}

async function syncActivityStaff() {
  const res = await fetch(SHEET_URL);
  if (!res.ok) throw new Error(`ดึงชีต HR ไม่สำเร็จ (HTTP ${res.status})`);
  const csv = await res.text();
  const rows = parseCsv(csv);
  const dataRows = rows.slice(1).filter((r) => norm(r[0]));

  const sheetRows = dataRows.map((r) => {
    const [code, name, team, area, nicknameRaw, phone] = r;
    const { nickname, gender } = splitNicknameGender(nicknameRaw);
    return {
      code: norm(code), name: norm(name), team_code: norm(team),
      area_owner: norm(area), nickname, gender, phone: norm(phone),
    };
  }).filter((r) => r.code && r.name);

  if (!sheetRows.length) throw new Error('อ่านชีต HR ได้แต่ไม่พบแถวข้อมูล (ตรวจรูปแบบคอลัมน์)');

  const { data: existing, error: exErr } = await supabase
    .from('approval_staff').select('code, role, home_lat, home_lng').eq('category', 'activity');
  if (exErr) throw new Error('อ่านรายชื่อเดิมไม่สำเร็จ: ' + exErr.message);
  const existingByCode = new Map(existing.map((r) => [r.code, r]));

  const upserts = sheetRows.map((r) => {
    const prev = existingByCode.get(r.code);
    return {
      code: r.code, category: 'activity', name: r.name, nickname: r.nickname,
      gender: r.gender, team_code: r.team_code, area_owner: r.area_owner, phone: r.phone,
      role: prev ? prev.role : null,
      home_lat: prev ? prev.home_lat : null,
      home_lng: prev ? prev.home_lng : null,
    };
  });

  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase.from('approval_staff').upsert(upserts.slice(i, i + 500), { onConflict: 'code,category' });
    if (error) throw new Error(`บันทึกรายชื่อไม่สำเร็จที่แถว ${i}: ${error.message}`);
  }

  return { count: upserts.length, syncedAt: new Date() };
}

module.exports = { syncActivityStaff, parseCsv };
