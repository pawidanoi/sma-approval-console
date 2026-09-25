// เรียก OpenRouteService Matrix API เพื่อได้ระยะทางถนนจริง (ไม่ใช่เส้นตรง) จากจุดหนึ่งไปหลายจุดในครั้งเดียว
// ฟรีเทียร์: 2,500 คำขอ/วัน, 40 คำขอ/นาที — ใช้เฉพาะตอน precompute เป็นชุด ไม่เรียกตอนพนักงานใช้งานจริง
// โดเมนเดิม api.openrouteservice.org เลิกใช้แล้วตั้งแต่ เม.ย. 2026 ย้ายมาอยู่ใต้ gateway รวมของ HeiGIT
// ต้องมี /json ต่อท้ายเส้นทางเป๊ะ ๆ (ไม่ใช่ query string ก็ได้ แต่ path เฉย ๆ ไม่มี /json จะได้ 404/406)
const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/matrix/driving-car/json';

// points: [{lat, lng}, ...] จุดแรกคือ source ที่เหลือคือ destinations — ORS ใช้ลำดับ [lng, lat]
async function matrixOneToMany(sourcePoint, destPoints) {
  const key = process.env.ORS_API_KEY;
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า ORS_API_KEY ใน .env');
  const locations = [[sourcePoint.lng, sourcePoint.lat], ...destPoints.map((p) => [p.lng, p.lat])];
  const res = await fetch(ORS_URL, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations,
      sources: [0],
      destinations: destPoints.map((_, i) => i + 1),
      metrics: ['distance', 'duration'],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ORS matrix ล้มเหลว (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const distancesM = data.distances?.[0] || [];
  const durationsS = data.durations?.[0] || [];
  return destPoints.map((_, i) => ({
    distance_km: distancesM[i] != null ? Math.round((distancesM[i] / 1000) * 10) / 10 : null,
    duration_min: durationsS[i] != null ? Math.round(durationsS[i] / 60) : null,
  }));
}

module.exports = { matrixOneToMany };
