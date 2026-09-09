// นำเข้า "แผนงานที่ต้องจอง" จากไฟล์ CSV export ของระบบ NSA Field Event Planner (ระบบของพี่อีกคน)
// คอลัมน์: ประเภทแถว, รหัสสาขา, ชื่อสาขา, ประเภทแฟร์, ทีม, จังหวัดที่ไป, วันเริ่ม PR, วันเริ่มกิจกรรม(D1)/วันที่, วันจบกิจกรรม, หมายเหตุ
const { parseCsv } = require('./staff-sync');

function norm(s) { const v = (s || '').trim(); return v ? v : null; }

function teamRawToCode(raw) {
  const m = norm(raw || '').match(/^ทีม\s*(\d+)$/);
  return m ? 'SMA' + m[1] : null;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// รูปแบบใหม่ (ตั้งแต่ ก.ย. 69): 1 แถว = 1 วัน คอลัมน์ ประเภท,รหัสสาขา,ชื่อสาขา,ประเภทแฟร์,ทีม,วันที่
// ประเภท: "วัน PR" | "วันจัดงาน" | "เดินทาง" | "หยุด" (หรือว่างเปล่า = ยังไม่วางแผน)
// เข้าพักตั้งแต่วัน PR วันแรกจนจบ "วันจัดงาน" วันสุดท้ายของสาขานั้น (ถ้าไม่มีวัน PR ก็เริ่มวันจัดงานวันแรกเลย)
// ทีมย่อย (แยก 2 สาขาวันเดียวกัน) ยังไม่มีในข้อมูลตอนนี้ — ถ้ามีในอนาคตจะมาเป็น "ทีม+วันที่ ซ้ำกันแต่คนละสาขา" (จับคู่ด้วย group_key ทีม+วันเริ่มอัตโนมัติ ไม่ต้องแก้โค้ดเพิ่ม)
function parseScheduleCsvDaily(text, sourceMonth) {
  const rows = parseCsv(text).slice(1).filter((r) => norm(r[4]));
  const parsed = rows.map((r) => ({
    rowType: norm(r[0]),
    branchCode: norm(r[1]),
    branchName: norm(r[2]),
    missionType: norm(r[3]),
    teamCode: teamRawToCode(r[4]),
    date: norm(r[5]),
  }));
  const skippedUnknownTeam = parsed.filter((r) => !r.teamCode).length;

  const byTeam = new Map();
  for (const r of parsed) {
    if (!r.teamCode) continue;
    const arr = byTeam.get(r.teamCode) || [];
    arr.push(r);
    byTeam.set(r.teamCode, arr);
  }

  const entries = [];
  for (const [teamCode, teamRows] of byTeam) {
    // วันเดินทางของทีมนี้ (ไม่ผูกกับสาขา — ใช้ขยายคืนสุดท้ายของงานที่จบพอดีก่อนวันเดินทาง)
    const travelDates = new Set(teamRows.filter((r) => r.rowType === 'เดินทาง').map((r) => r.date));

    const byBranch = new Map();
    for (const r of teamRows) {
      if (r.rowType !== 'วัน PR' && r.rowType !== 'วันจัดงาน') continue;
      const arr = byBranch.get(r.branchCode) || [];
      arr.push(r);
      byBranch.set(r.branchCode, arr);
    }

    for (const [branchCode, branchRowsRaw] of byBranch) {
      const branchRows = branchRowsRaw.slice().sort((a, b) => a.date.localeCompare(b.date));
      let runStart = 0;
      for (let i = 1; i <= branchRows.length; i++) {
        const brokeRun = i === branchRows.length || addDays(branchRows[i - 1].date, 1) !== branchRows[i].date;
        if (!brokeRun) continue;
        const run = branchRows.slice(runStart, i);
        runStart = i;
        const first = run[0];
        const last = run[run.length - 1];
        const prRow = run.find((r) => r.rowType === 'วัน PR');
        const actRow = run.find((r) => r.rowType === 'วันจัดงาน');
        let checkout = addDays(last.date, 1);
        while (travelDates.has(checkout)) checkout = addDays(checkout, 1);
        entries.push({
          team_category: 'activity',
          team_code: teamCode,
          row_type: 'กิจกรรม',
          branch_code: branchCode,
          branch_name: last.branchName,
          mission_type: last.missionType,
          group_key: teamCode + '|' + first.date,
          pr_start_date: prRow ? prRow.date : null,
          activity_start_date: actRow ? actRow.date : first.date,
          activity_end_date: last.date,
          suggested_checkin: first.date,
          suggested_checkout: checkout,
          note: null,
          source_month: sourceMonth,
        });
      }
    }
  }
  return { entries, skippedUnknownTeam };
}

// แปลง CSV ดิบ เป็นรายการ "ต้องจอง" (กิจกรรม/ทีมย่อย) พร้อมช่วงวันที่แนะนำ
// เดินทาง/หยุด ใช้แค่คำนวณว่าคืนสุดท้ายควรขยายไปคลุมวันเดินทางที่ต่อเนื่องกันไหม ไม่เก็บเป็นแถวแยก
function parseScheduleCsvRange(text, sourceMonth) {
  const rows = parseCsv(text).slice(1).filter((r) => norm(r[0]));
  const parsed = rows.map((r) => ({
    rowType: norm(r[0]),
    branchCode: norm(r[1]),
    branchName: norm(r[2]),
    missionType: norm(r[3]),
    teamCode: teamRawToCode(r[4]),
    prStart: norm(r[6]),
    actStart: norm(r[7]),
    actEnd: norm(r[8]),
    note: norm(r[9]),
  }));

  const skippedUnknownTeam = parsed.filter((r) => !r.teamCode).length;
  const byTeam = new Map();
  for (const r of parsed) {
    if (!r.teamCode) continue;
    const arr = byTeam.get(r.teamCode) || [];
    arr.push(r);
    byTeam.set(r.teamCode, arr);
  }

  const entries = [];
  for (const [teamCode, teamRows] of byTeam) {
    teamRows.sort((a, b) => (a.actStart || '').localeCompare(b.actStart || ''));
    for (let i = 0; i < teamRows.length; i++) {
      const r = teamRows[i];
      if (r.rowType !== 'กิจกรรม' && r.rowType !== 'ทีมย่อย') continue;
      const suggestedCheckin = r.prStart || r.actStart;
      let suggestedCheckout = addDays(r.actEnd || r.actStart, 1);
      // ข้ามแถวคู่ (ทีมย่อยที่วันเริ่มเดียวกัน) ก่อน แล้วค่อยขยายคืนสุดท้ายให้คลุมวันเดินทางที่ต่อเนื่องกันทันทีหลังกิจกรรมจบ
      let j = i + 1;
      while (j < teamRows.length && teamRows[j].actStart === r.actStart) j++;
      while (j < teamRows.length && teamRows[j].rowType === 'เดินทาง' && teamRows[j].actStart === suggestedCheckout) {
        suggestedCheckout = addDays(teamRows[j].actStart, 1);
        j++;
      }
      entries.push({
        team_category: 'activity',
        team_code: teamCode,
        row_type: r.rowType,
        branch_code: r.branchCode,
        branch_name: r.branchName,
        mission_type: r.missionType,
        group_key: teamCode + '|' + r.actStart,
        pr_start_date: r.prStart,
        activity_start_date: r.actStart,
        activity_end_date: r.actEnd,
        suggested_checkin: suggestedCheckin,
        suggested_checkout: suggestedCheckout,
        note: r.note,
        source_month: sourceMonth,
      });
    }
  }
  return { entries, skippedUnknownTeam };
}

// ตรวจรูปแบบไฟล์จากหัวคอลัมน์อัตโนมัติ: แบบเก่ามี "วันเริ่ม PR" เป็นคอลัมน์แยก (10 คอลัมน์), แบบใหม่มีแค่ "วันที่" (6 คอลัมน์)
function parseScheduleCsv(text, sourceMonth) {
  const firstLine = (text.split(/\r?\n/, 1)[0] || '');
  const isDaily = firstLine.includes('วันที่') && !firstLine.includes('วันเริ่ม PR');
  return isDaily ? parseScheduleCsvDaily(text, sourceMonth) : parseScheduleCsvRange(text, sourceMonth);
}

module.exports = { parseScheduleCsv, parseScheduleCsvDaily, parseScheduleCsvRange };
