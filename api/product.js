// api/products.js — Vercel Serverless Function
// Handles reading and writing products from Firebase Firestore

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = initFirebase();

  // ── GET /api/products — Public, no auth needed ──
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('products')
        .orderBy('category')
        .get();

      const products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.status(200).json({ products });

    } catch (err) {
      console.error('Error fetching products:', err);
      return res.status(500).json({ error: 'Failed to fetch products.' });
    }
  }

  // ── POST /api/products — Admin only, add product ──
  if (req.method === 'POST') {
    try {
      const { name, category, tag, price, description, emoji, colorClass, image, stock } = req.body;
      if (!name || !price) return res.status(400).json({ error: 'name and price required' });

      const product = {
        name, category: category || 'General',
        tag: tag || 'New',
        price: parseFloat(price),
        description: description || '',
        emoji: emoji || '🧼',
        colorClass: colorClass || 'pi1',
        image: image || '',
        stock: parseInt(stock) || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await db.collection('products').add(product);
      return res.status(200).json({ success: true, productId: docRef.id });

    } catch (err) {
      console.error('Error adding product:', err);
      return res.status(500).json({ error: 'Failed to add product.' });
    }
  }

  // ── PUT /api/products — Admin only, update product ──
  if (req.method === 'PUT') {
    try {
      const { productId, ...updates } = req.body;
      if (!productId) return res.status(400).json({ error: 'productId required' });
      updates.updatedAt = new Date().toISOString();
      await db.collection('products').doc(productId).update(updates);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update product.' });
    }
  }

  // ── DELETE /api/products — Admin only ──
  if (req.method === 'DELETE') {
    try {
      const { productId } = req.body;
      if (!productId) return res.status(400).json({ error: 'productId required' });
      await db.collection('products').doc(productId).delete();
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete product.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
