const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'ไม่พบ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — สร้างไฟล์ .env จาก .env.example แล้วใส่ค่าจริงก่อนรัน'
  );
}

// service role key -- รันฝั่ง server เท่านั้น ไม่เปิดเผยไปฝั่ง client เด็ดขาด
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = { supabase };
