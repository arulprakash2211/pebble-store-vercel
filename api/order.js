// api/orders.js — Vercel Serverless Function
// Handles saving and retrieving orders from Firebase Firestore

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialise Firebase Admin (runs server-side, secret is safe here)
function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = initFirebase();

  // ── POST /api/orders — Save a new order ──
  if (req.method === 'POST') {
    try {
      const { name, phone, email, address, items, total, notes, orderVia } = req.body;

      // Validate required fields
      if (!name || !phone || !items || !items.length) {
        return res.status(400).json({ error: 'Missing required fields: name, phone, items' });
      }

      // Build order object
      const order = {
        name,
        phone,
        email: email || '',
        address: address || '',
        items,           // array of { id, name, price, qty, subtotal }
        total,
        notes: notes || '',
        orderVia: orderVia || 'Website',
        status: 'new',   // new → confirmed → dispatched → delivered
        paid: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to Firestore
      const docRef = await db.collection('orders').add(order);

      return res.status(200).json({
        success: true,
        orderId: docRef.id,
        message: 'Order placed successfully!'
      });

    } catch (err) {
      console.error('Error saving order:', err);
      return res.status(500).json({ error: 'Failed to save order. Please try again.' });
    }
  }

  // ── GET /api/orders — Get all orders (admin only) ──
  if (req.method === 'GET') {
    try {
      // Verify admin token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorised' });
      }

      const snapshot = await db.collection('orders')
        .orderBy('createdAt', 'desc')
        .get();

      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.status(200).json({ orders });

    } catch (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: 'Failed to fetch orders.' });
    }
  }

  // ── PUT /api/orders — Update order status (admin only) ──
  if (req.method === 'PUT') {
    try {
      const { orderId, status, paid } = req.body;
      if (!orderId) return res.status(400).json({ error: 'orderId required' });

      const updates = { updatedAt: new Date().toISOString() };
      if (status !== undefined) updates.status = status;
      if (paid !== undefined) updates.paid = paid;

      await db.collection('orders').doc(orderId).update(updates);
      return res.status(200).json({ success: true });

    } catch (err) {
      console.error('Error updating order:', err);
      return res.status(500).json({ error: 'Failed to update order.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
