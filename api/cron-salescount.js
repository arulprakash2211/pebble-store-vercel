// api/cron-salescount.js — Daily job: compute total qty sold per product from
// all orders (excluding cancelled) and store it as `soldCount` on each product.
// The admin order dropdown & storefront can then sort "most sold first" with no
// extra queries. Runs on a Vercel Cron (see vercel.json).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = initFirebase();
  try {
    // Aggregate qty sold per product id (skip cancelled orders)
    const ordersSnap = await db.collection('orders').get();
    const counts = {};
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      if (o.status === 'cancelled') return;
      (o.items || []).forEach(it => { if (it.id) counts[it.id] = (counts[it.id] || 0) + (Number(it.qty) || 0); });
    });

    // Write soldCount onto every product (0 where unsold), in batches
    const prodSnap = await db.collection('products').get();
    let batch = db.batch(), n = 0, updated = 0;
    for (const doc of prodSnap.docs) {
      const want = counts[doc.id] || 0;
      if ((doc.data().soldCount || 0) === want) continue;   // skip unchanged
      batch.update(doc.ref, { soldCount: want });
      updated++;
      if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
    if (n > 0) await batch.commit();

    const summary = { ok: true, products: prodSnap.size, updated, at: new Date().toISOString() };
    console.log('[cron-salescount]', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    console.error('cron-salescount error:', err);
    return res.status(500).json({ error: err.message });
  }
}
