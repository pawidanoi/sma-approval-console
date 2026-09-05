// ส่งแจ้งเตือนผ่าน LINE OA "น้องมะม่วง" (ใช้ตาราง employees.line_user_id ที่ระบบ LINE bot เดิมผูกไว้แล้ว — ฐานข้อมูลเดียวกัน)
// ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อนถึงจะส่งได้จริง (ไม่งั้นแค่ log แล้วคืน sent:false)
const { supabase } = require('./supabase');

async function pushLineMessage(lineUserId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) { console.log('[line-notify] ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ข้ามการส่งจริง:', text); return { sent: false, reason: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' }; }
  if (!lineUserId) return { sent: false, reason: 'ไม่พบ LINE ของคนนี้ (ยังไม่ได้ผูกบัญชี)' };
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) { const body = await res.text().catch(() => ''); return { sent: false, reason: `LINE API error ${res.status}: ${body}` }; }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: 'ส่งไม่สำเร็จ: ' + err.message };
  }
}

// ส่งข้อความหาโดยระบุ "รหัสพนักงาน" — ไปหา line_user_id จากตาราง employees
async function notifyEmployee(employeeCode, text) {
  const { data: emp, error } = await supabase.from('employees').select('line_user_id, receives_notify').eq('code', employeeCode).maybeSingle();
  if (error) return { sent: false, reason: 'อ่านข้อมูล LINE ไม่สำเร็จ: ' + error.message };
  if (!emp || !emp.receives_notify) return { sent: false, reason: 'คนนี้ปิดรับการแจ้งเตือน หรือยังไม่ได้ผูกบัญชี LINE' };
  return pushLineMessage(emp.line_user_id, text);
}

module.exports = { pushLineMessage, notifyEmployee };
