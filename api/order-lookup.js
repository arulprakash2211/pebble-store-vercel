// api/order-lookup.js — Public order lookup for the Track page.
// Runs server-side with firebase-admin (bypasses security rules) so the browser
// never needs read access to the orders collection. Returns ONLY the orders that
// match the given phone number or tracking id.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// last 10 digits, so +91 / spacing variants match
const normPhone = (p) => String(p ?? '').replace(/\D/g, '').slice(-10);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, trackingId } = req.body || {};
  const db = initFirebase();

  try {
    let snap;
    if (trackingId) {
      snap = await db.collection('orders')
        .where('tracking.trackingId', '==', String(trackingId).trim())
        .get();
    } else if (phone) {
      const norm = normPhone(phone);
      if (norm.length < 10) return res.status(400).json({ success: false, error: 'Invalid phone number' });
      snap = await db.collection('orders').where('phoneNorm', '==', norm).get();
    } else {
      return res.status(400).json({ success: false, error: 'phone or trackingId required' });
    }

    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ success: true, orders });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
