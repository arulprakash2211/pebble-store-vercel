// api/cron-track.js — Daily scheduled job (consolidated to fit Vercel Hobby limits):
//   1) refresh status of all undelivered (dispatched) orders via /api/track
//   2) recompute each product's `soldCount` (qty sold, excl. cancelled) for
//      "most sold first" ordering.
// One cron entry in vercel.json triggers this once a day.

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

  // ── Part 2: recompute soldCount per product (qty sold, excludes cancelled) ──
  let salesUpdated = 0, productsScanned = 0;
  try {
    const ordersSnap = await db.collection('orders').get();
    const counts = {};
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      if (o.status === 'cancelled') return;
      (o.items || []).forEach(it => { if (it.id) counts[it.id] = (counts[it.id] || 0) + (Number(it.qty) || 0); });
    });
    const prodSnap = await db.collection('products').get();
    productsScanned = prodSnap.size;
    let batch = db.batch(), n = 0;
    for (const doc of prodSnap.docs) {
      const want = counts[doc.id] || 0;
      if ((doc.data().soldCount || 0) === want) continue;
      batch.update(doc.ref, { soldCount: want });
      salesUpdated++;
      if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n > 0) await batch.commit();
  } catch (err) { console.error('soldCount step failed:', err); }

  const summary = { ok: true, dispatched: orders.length, checked, delivered, errors, productsScanned, salesUpdated, at: new Date().toISOString() };
  console.log('[cron-daily]', JSON.stringify(summary));
  return res.status(200).json(summary);
}
