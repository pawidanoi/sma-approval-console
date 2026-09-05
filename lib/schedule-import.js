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

// แปลง CSV ดิบ เป็นรายการ "ต้องจอง" (กิจกรรม/ทีมย่อย) พร้อมช่วงวันที่แนะนำ
// เดินทาง/หยุด ใช้แค่คำนวณว่าคืนสุดท้ายควรขยายไปคลุมวันเดินทางที่ต่อเนื่องกันไหม ไม่เก็บเป็นแถวแยก
function parseScheduleCsv(text, sourceMonth) {
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

module.exports = { parseScheduleCsv };
