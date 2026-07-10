// api/next-order-no.js — Returns the next sequential order number.
// Runs server-side with firebase-admin so the browser doesn't need read access
// to the orders collection. O(1): reads only the single highest-numbered order.

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = initFirebase();
  try {
    const snap = await db.collection('orders').orderBy('orderNo', 'desc').limit(1).get();
    const top = snap.docs[0] && snap.docs[0].data().orderNo;
    const orderNo = (typeof top === 'number' ? top : 999) + 1;
    return res.status(200).json({ orderNo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
