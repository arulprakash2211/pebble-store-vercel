// api/track.js — Universal courier tracking
// Supports: ST Courier, DTDC, Professional Courier, India Post

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

// ── Fetch with browser-like headers ──
async function fetchPage(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      ...(options.headers || {})
    },
    ...options
  });
  return res;
}

// ── Map status text to our order status ──
function mapStatus(text) {
  const t = text.toLowerCase();
  if (t.includes('delivered'))         return { mapped: 'delivered',  raw: 'Delivered ✅' };
  if (t.includes('out for delivery'))  return { mapped: 'dispatched', raw: 'Out for Delivery 🚚' };
  if (t.includes('reached'))           return { mapped: 'dispatched', raw: 'Reached Destination 📍' };
  if (t.includes('in transit'))        return { mapped: 'dispatched', raw: 'In Transit 🔄' };
  if (t.includes('dispatched'))        return { mapped: 'dispatched', raw: 'Dispatched 📦' };
  if (t.includes('picked') || t.includes('booked') || t.includes('manifested')) {
    return { mapped: 'dispatched', raw: 'Picked Up 📦' };
  }
  return { mapped: 'dispatched', raw: 'In Transit 🔄' };
}

// ── Clean HTML to plain text ──
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Extract meaningful rows from table HTML ──
function extractTableData(html) {
  const results = [];
  // Extract td contents
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  const cells = [];
  while ((m = tdRegex.exec(html)) !== null) {
    const text = htmlToText(m[1]).trim();
    if (text.length > 2) cells.push(text);
  }
  // Group cells into rows of meaningful data
  for (let i = 0; i < cells.length; i += 3) {
    const row = cells.slice(i, i + 3).join(' | ');
    if (row.length > 5) results.push(row);
  }
  return results.slice(0, 4);
}

// ════════════════════
// ST COURIER
// ════════════════════
async function trackSTCourier(trackingId) {
  // New stcourier.com flow (2025+): the tracking form stores the AWB in a
  // server session via POST /track/doCheck, then the /track/shipment page
  // renders the result. Three steps sharing one cookie — no captcha on tracking.
  const BASE = 'https://stcourier.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const getCookie = (res) => {
    const arr = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
    return arr.map(c => String(c).split(';')[0]).join('; ');
  };
  try {
    // 1) Session cookie
    const r1 = await fetch(`${BASE}/track/shipment`, { headers: { 'User-Agent': UA } });
    const cookie = getCookie(r1);

    // 2) Submit the AWB into the session
    await fetch(`${BASE}/track/doCheck`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE}/track/shipment`
      },
      body: 'awb_no=' + encodeURIComponent(trackingId)
    });

    // 3) Reload the results page with the same session
    const r3 = await fetch(`${BASE}/track/shipment`, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
    const html = await r3.text();

    if (!html.includes(String(trackingId))) {
      return { success: false, error: 'Tracking ID not found on ST Courier. Please verify the ID.' };
    }

    // Pull all <td> cell texts, then read the value that follows each label
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = tdRe.exec(html)) !== null) cells.push(htmlToText(m[1]).trim());
    const after = (label) => {
      const i = cells.findIndex(c => c.toLowerCase() === label.toLowerCase());
      return i >= 0 && cells[i + 1] ? cells[i + 1] : '';
    };

    const status   = after('Current Status');
    const booked   = after('Book Date/Time');
    const delivered = after('Delivery Date/Time');
    const origin   = after('Orgin SRC') || after('Origin SRC');
    const dest     = after('Destination');

    if (!status) return { success: false, error: 'No status found for this ST Courier AWB.' };

    const { mapped } = mapStatus(status);
    const details = [
      delivered && `Delivered: ${delivered}`,
      !delivered && origin && dest && `${origin} → ${dest}`,
      booked && `Booked: ${booked}`
    ].filter(Boolean).join(' · ');

    return { success: true, rawStatus: status, mappedStatus: mapped, details: details || 'Status updated' };
  } catch (err) {
    return { success: false, error: 'Could not reach ST Courier. Try again later.' };
  }
}

// ════════════════════
// DTDC
// ════════════════════
async function trackDTDC(trackingId) {
  try {
    // Try DTDC API first
    const apiRes = await fetchPage(
      `https://www.dtdc.in/trace/TrackingApi?action=track_single&cno=${trackingId}`,
      { headers: { 'Referer': 'https://www.dtdc.in/', 'Accept': 'application/json, text/plain, */*' } }
    );
    const text = await apiRes.text();

    try {
      const data = JSON.parse(text);
      const events = data?.trackDetails || data?.shipmentTrackingDetails || data?.data || [];
      if (Array.isArray(events) && events.length > 0) {
        const latest = events[0];
        const rawStatus = latest.status || latest.Remarks || latest.Activity || 'In Transit';
        const { mapped } = mapStatus(rawStatus);
        const details = events.slice(0, 3)
          .map(e => `${e.date || e.Date || ''} ${e.location || e.Location || ''}: ${e.status || e.Remarks || ''}`.trim())
          .filter(Boolean)
          .join(' → ');
        return { success: true, rawStatus: rawStatus + (rawStatus.includes('✅') || rawStatus.includes('🚚') ? '' : ' 📦'), mappedStatus: mapped, details };
      }
    } catch (_) {}

    // Fallback: HTML page
    const pageRes = await fetchPage(
      `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb&strCNno=${trackingId}`,
      { headers: { 'Referer': 'https://www.dtdc.in/' } }
    );
    const html = await pageRes.text();
    const lower = html.toLowerCase();

    if (lower.includes('not found') || lower.includes('no record')) {
      return { success: false, error: 'Tracking ID not found on DTDC.' };
    }

    const plainText = htmlToText(html);
    const { mapped, raw } = mapStatus(plainText);
    const rows = extractTableData(html);
    return { success: true, rawStatus: raw, mappedStatus: mapped, details: rows.join(' → ') || 'Status fetched' };

  } catch (err) {
    return { success: false, error: 'Could not reach DTDC. Try again later.' };
  }
}

// ════════════════════
// PROFESSIONAL COURIER
// ════════════════════
async function trackProfessional(trackingId) {
  try {
    const res = await fetchPage(
      `https://www.tpcindia.com/tracking.php?id=${trackingId}&type=0&service=0`,
      { headers: { 'Referer': 'https://www.tpcindia.com/' } }
    );
    const html = await res.text();
    const lower = html.toLowerCase();

    if (lower.includes('not found') || lower.includes('invalid') || lower.includes('no record')) {
      return { success: false, error: 'Tracking ID not found on Professional Courier.' };
    }

    const plainText = htmlToText(html);
    const { mapped, raw } = mapStatus(plainText);
    const rows = extractTableData(html);
    return { success: true, rawStatus: raw, mappedStatus: mapped, details: rows.join(' → ') || 'Status fetched' };

  } catch (err) {
    return { success: false, error: 'Could not reach Professional Courier. Try again later.' };
  }
}

// ════════════════════
// INDIA POST
// ════════════════════
async function trackIndiaPost(trackingId) {
  try {
    // India Post tracking API
    const res = await fetch(
      `https://www.indiapost.gov.in/VAS/api/Tracking/GetTrackingData?id=${trackingId}`,
      {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.indiapost.gov.in/',
          'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0'
        }
      }
    );
    const data = await res.json();
    const events = data?.data?.trackingData || data?.trackingData || data?.data || [];

    if (Array.isArray(events) && events.length > 0) {
      const latest = events[events.length - 1];
      const rawStatus = latest.eventType || latest.Event || latest.description || 'In Transit';
      const { mapped } = mapStatus(rawStatus);
      const details = [...events].reverse().slice(0, 3)
        .map(e => `${e.eventDate || e.Date || ''} ${e.office || e.Office || ''}: ${e.eventType || e.Event || ''}`.trim())
        .filter(Boolean)
        .join(' → ');
      return {
        success: true,
        rawStatus: rawStatus + (rawStatus.toLowerCase().includes('deliver') ? ' ✅' : ' 📮'),
        mappedStatus: mapped,
        details
      };
    }
    return { success: false, error: 'No tracking data found for this India Post tracking number.' };

  } catch (err) {
    return { success: false, error: 'Could not reach India Post API. Try again later.' };
  }
}

// ════════════════════
// MAIN HANDLER
// ════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, trackingId, courier } = req.body;
  if (!orderId || !trackingId || !courier) {
    return res.status(400).json({ error: 'orderId, trackingId and courier required' });
  }

  console.log(`Tracking ${courier} for ${trackingId}`);

  let result;
  switch (courier) {
    case 'ST Courier':           result = await trackSTCourier(trackingId);   break;
    case 'DTDC':                 result = await trackDTDC(trackingId);         break;
    case 'Professional Courier': result = await trackProfessional(trackingId); break;
    case 'India Post':           result = await trackIndiaPost(trackingId);    break;
    default:
      return res.status(200).json({
        success: false,
        error: `Auto-tracking not available for ${courier}. Please visit their website directly.`
      });
  }

  console.log(`Result for ${courier}:`, result);

  if (!result.success) {
    return res.status(200).json(result);
  }

  // Save to Firestore
  try {
    const db = initFirebase();
    const updates = {
      'tracking.rawStatus':  result.rawStatus,
      'tracking.details':    result.details || '',
      'tracking.fetchedAt':  new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (result.mappedStatus === 'delivered') {
      updates.status = 'delivered';
    }
    await db.collection('orders').doc(orderId).update(updates);
  } catch (err) {
    console.error('Firestore update error:', err);
  }

  return res.status(200).json({
    success:      true,
    rawStatus:    result.rawStatus,
    mappedStatus: result.mappedStatus,
    details:      result.details || '',
    fetchedAt:    new Date().toISOString()
  });
}
