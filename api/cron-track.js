// api/cron-track.js — Scheduled job: refresh status of all undelivered (dispatched) orders
// Runs on a Vercel Cron schedule (see vercel.json). Reuses /api/track per order,
// which fetches the courier status, saves it, and auto-marks Delivered.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Allow up to 60s — we process several orders per run
export const config = { maxDuration: 60 };

function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  // If CRON_SECRET is set, only allow Vercel's authenticated cron calls
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = initFirebase();
  const base = `https://${req.headers.host}`;

  let orders = [];
  try {
    const snap = await db.collection('orders').where('status', '==', 'dispatched').get();
    orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => o.tracking && o.tracking.trackingId && o.tracking.courier);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load orders: ' + err.message });
  }

  let checked = 0, delivered = 0, errors = 0;
  const CONCURRENCY = 4; // small batches so we don't hit the courier sites too hard / time out

  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const batch = orders.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (o) => {
      try {
        const r = await fetch(`${base}/api/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.id, trackingId: o.tracking.trackingId, courier: o.tracking.courier })
        });
        const data = await r.json();
        checked++;
        if (data && data.success && data.mappedStatus === 'delivered') delivered++;
      } catch (_) { errors++; }
    }));
  }

  const summary = { ok: true, dispatched: orders.length, checked, delivered, errors, at: new Date().toISOString() };
  console.log('[cron-track]', JSON.stringify(summary));
  return res.status(200).json(summary);
}
