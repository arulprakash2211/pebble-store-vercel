/* ═══════════════════════════════════════
   PEBBLE STORE – app.js
   2 options: Payment | WhatsApp query
   ═══════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyA-tA1L4XZk644INv5Hu2_iySOjVMkzpPo",
  authDomain: "pebble-store-70889.firebaseapp.com",
  projectId: "pebble-store-70889",
  storageBucket: "pebble-store-70889.firebasestorage.app",
  messagingSenderId: "611731436877",
  appId: "1:611731436877:web:eee0ef64cd8b4b86467304"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const WHATSAPP_NUMBER = '918925401892';
let allProducts = [];
const cart = {};


// ══════════════════════════════
// ORDER TRACKING (inline section)
// ══════════════════════════════
const COURIER_URLS = {
  'ST Courier':           id => `https://www.stcourier.com/`,
  'Professional Courier': id => `https://www.tpcindia.com/tracking.php?id=${id}&type=0&service=0`,
  'DTDC':                 id => `https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb&strCNno=${id}`,
  'India Post':           id => `https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx`,
};

// For couriers where direct URL tracking doesn't work, show copy button
const COURIER_MANUAL = ['ST Courier', 'India Post'];

const STATUS_LABEL = {
  new: '🟡 Order Received', confirmed: '🔵 Confirmed', ready: '📦 Ready for Dispatch',
  dispatched: '🚚 Dispatched', delivered: '✅ Delivered', cancelled: '❌ Cancelled'
};

window.switchTrackTab = function(tab) {
  const isPhone = tab === 'phone';
  document.getElementById('trackPhonePanel').style.display = isPhone ? 'block' : 'none';
  document.getElementById('trackIdPanel').style.display    = isPhone ? 'none'  : 'block';
  document.getElementById('tabPhoneBtn').style.background  = isPhone ? 'var(--bark)' : 'var(--warm-white)';
  document.getElementById('tabPhoneBtn').style.color       = isPhone ? 'var(--cream)' : 'var(--stone)';
  document.getElementById('tabTrackBtn').style.background  = isPhone ? 'var(--warm-white)' : 'var(--bark)';
  document.getElementById('tabTrackBtn').style.color       = isPhone ? 'var(--stone)' : 'var(--cream)';
  document.getElementById('trackResultInline').style.display = 'none';
};

async function showTrackResult(order) {
  const el = document.getElementById('trackResultInline');
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const items = (order.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
  let statusLabel = STATUS_LABEL[order.status] || order.status;

  // Auto-fetch ST Courier status on demand
  const SUPPORTED_COURIERS = ['ST Courier', 'DTDC', 'Professional Courier', 'India Post'];
  if (SUPPORTED_COURIERS.includes(order.tracking?.courier) && order.tracking?.trackingId && order.status !== 'delivered') {
    el.innerHTML = '<p style="color:var(--light-text);font-style:italic;font-size:0.85rem">Fetching live status from ST Courier…</p>';
    el.style.display = 'block';
    try {
      const trackRes = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, trackingId: order.tracking.trackingId, courier: order.tracking.courier })
      });
      const trackData = await trackRes.json();
      if (trackData.success) {
        order.tracking.rawStatus = trackData.rawStatus;
        order.tracking.details   = trackData.details;
        order.tracking.fetchedAt = trackData.fetchedAt;
        if (trackData.mappedStatus) order.status = trackData.mappedStatus;
        statusLabel = trackData.rawStatus || STATUS_LABEL[order.status] || order.status;
      }
    } catch (err) {
      console.warn('Live tracking fetch failed:', err);
    }
  }

  let trackingHtml = '';
  if (order.tracking) {
    const { courier, trackingId, rawStatus, details, fetchedAt } = order.tracking;
    const url = COURIER_URLS[courier] ? COURIER_URLS[courier](trackingId) : null;
    const isManual = COURIER_MANUAL && COURIER_MANUAL.includes(courier);
    const fetchedTime = fetchedAt ? `<div style="font-size:0.7rem;color:var(--stone);margin-top:0.3rem">Last checked: ${new Date(fetchedAt).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</div>` : '';
    const liveStatus = rawStatus ? `<div style="font-size:0.85rem;color:var(--moss);font-weight:600;margin-top:0.4rem">📍 ${rawStatus}</div>${details ? `<div style="font-size:0.75rem;color:var(--light-text);margin-top:0.2rem">${details}</div>` : ''}${fetchedTime}` : '';
    trackingHtml = `
      <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid rgba(92,61,46,0.1)">
        <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--stone);margin-bottom:0.4rem">Courier Details</div>
        <div style="font-size:0.88rem;color:var(--dark);margin-bottom:0.4rem"><strong>${courier}</strong> · <span style="font-family:monospace;color:var(--stone)">${trackingId}</span></div>
        ${liveStatus}
        ${url ? `<a href="${url}" target="_blank" style="display:inline-flex;align-items:center;gap:0.4rem;margin-top:0.8rem;padding:0.45rem 0.9rem;background:transparent;border:1px solid rgba(92,61,46,0.3);color:var(--bark);text-decoration:none;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:500">↗ Open ${courier} site</a>` : ''}
      </div>`;
  }

  el.innerHTML = `
    <div style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--stone);margin-bottom:0.8rem;font-weight:500">Order Found</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.85rem;margin-bottom:0.5rem">
      <div><span style="color:var(--light-text)">Name:</span> <strong>${order.name}</strong></div>
      <div><span style="color:var(--light-text)">Date:</span> ${date}</div>
      <div><span style="color:var(--light-text)">Items:</span> ${items}</div>
      <div><span style="color:var(--light-text)">Total:</span> <strong>₹${order.total}</strong></div>
    </div>
    <div style="font-size:0.9rem;margin-top:0.5rem"><span style="color:var(--light-text)">Status:</span> <strong>${statusLabel}</strong></div>
    ${trackingHtml}
    <div style="margin-top:1rem"><a href="/track.html" style="font-size:0.78rem;color:var(--clay);text-decoration:none">View full tracking page →</a></div>`;

  el.style.display = 'block';
  el.style.borderLeftColor = order.tracking ? 'var(--moss)' : 'var(--clay)';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showTrackError(msg) {
  const el = document.getElementById('trackResultInline');
  el.innerHTML = `<p style="color:#c0392b;font-size:0.88rem">${msg}</p>`;
  el.style.display = 'block';
  el.style.borderLeftColor = '#c0392b';
}

// Store found orders by index for onclick reference
const trackOrderCache = {};

window.doTrackByPhone = async function() {
  const phone = document.getElementById('trackPhone').value.trim();
  if (!phone) { showTrackError('Please enter your phone number.'); return; }
  const el = document.getElementById('trackResultInline');
  el.innerHTML = '<p style="color:var(--light-text);font-style:italic;font-size:0.85rem">Looking up your order…</p>';
  el.style.display = 'block';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(o => { const c = phone.replace(/[^0-9]/g, ''); return o.phone && o.phone.replace(/[^0-9]/g, '') === c; })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!orders.length) { showTrackError('No orders found for this phone number.'); return; }
    if (orders.length === 1) { await showTrackResult(orders[0]); return; }

    // Multiple orders — store in cache and reference by index
    orders.forEach((o, i) => { trackOrderCache[i] = o; });
    el.innerHTML = `<div style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--stone);margin-bottom:0.8rem;font-weight:500">Multiple orders found — select one:</div>` +
      orders.map((o, i) => {
        const date = new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
        const items = (o.items || []).map(x => x.name).join(', ');
        return `<div onclick="selectTrackOrder(${i})" style="padding:0.8rem 1rem;background:var(--warm-white);margin-bottom:0.5rem;cursor:pointer;border:1.5px solid transparent;font-size:0.85rem;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--bark)'" onmouseout="this.style.borderColor='transparent'">
          <strong>${date}</strong> &nbsp;·&nbsp; <strong>₹${o.total}</strong>
          <div style="font-size:0.75rem;color:var(--light-text);margin-top:0.2rem">${items}</div>
          <span style="font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;padding:0.15rem 0.5rem;border-radius:2px;background:#fff3cd;color:#856404;display:inline-block;margin-top:0.3rem">${o.status}</span>
        </div>`;
      }).join('');
    el.style.display = 'block';
  } catch (err) {
    console.error('Track by phone error:', err);
    showTrackError('Error: ' + err.message);
  }
};

window.selectTrackOrder = async function(index) {
  const order = trackOrderCache[index];
  if (order) await showTrackResult(order);
};

window.doTrackById = async function() {
  const trackId = document.getElementById('trackId').value.trim();
  if (!trackId) { showTrackError('Please enter your tracking ID.'); return; }
  const el = document.getElementById('trackResultInline');
  el.innerHTML = '<p style="color:var(--light-text);font-style:italic;font-size:0.85rem">Looking up your order…</p>';
  el.style.display = 'block';
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const order = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .find(o => o.tracking?.trackingId === trackId);
    if (!order) { showTrackError('No order found with this tracking ID.'); return; }
    showTrackResult(order);
  } catch (err) { showTrackError('Something went wrong. Please try again.'); }
};

// ── Sync cart from sessionStorage (shared with product page) ──
function syncCartFromSession() {
  const saved = localStorage.getItem('pebble_cart');
  if (saved) {
    const saved_cart = JSON.parse(saved);
    Object.entries(saved_cart).forEach(([id, qty]) => {
      if (qty > 0) cart[id] = qty;
    });
  }
}

function saveCartToSession() {
  localStorage.setItem('pebble_cart', JSON.stringify(cart));
  updateCartNav();
}

function updateCartNav() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const count = items.reduce((s, [, q]) => s + q, 0);
  const total = items.reduce((sum, [id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  // Nav badge
  const el = document.getElementById('cartNavCount');
  if (el) {
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // Sticky cart bar
  const bar = document.getElementById('cartBar');
  if (bar) {
    if (count > 0) {
      bar.style.display = 'flex';
      const infoEl = document.getElementById('cartBarInfo');
      const totalEl = document.getElementById('cartBarTotal');
      if (infoEl) infoEl.textContent = `${count} item${count > 1 ? 's' : ''} in cart`;
      if (totalEl) totalEl.textContent = `₹${total}`;
    } else {
      bar.style.display = 'none';
    }
  }
}

// ── Init ──
async function init() {
  syncCartFromSession();
  await loadProducts();
}

// ── Load products from Firestore ──
async function loadProducts() {
  const grid     = document.getElementById('productsGrid');
  const filtersEl = document.getElementById('categoryFilters');
  try {
    const snap  = await getDocs(collection(db, 'products'));
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => !p.hidden);  // hide products marked as hidden in admin

    if (!allProducts.length) {
      grid.innerHTML = '<p style="color:var(--light-text);grid-column:1/-1;font-style:italic">No products yet. Check back soon!</p>';
      return;
    }

    // Categories only — no "All" tab, start with Soaps
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    // Put Soaps first if it exists
    const sorted = categories.includes('Soaps')
      ? ['Soaps', ...categories.filter(c => c !== 'Soaps')]
      : categories;

    filtersEl.innerHTML = sorted.map((cat, i) =>
      `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join('');

    filtersEl.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts(allProducts.filter(p => p.category === btn.dataset.cat));
      });
    });

    // Start with first category (Soaps)
    renderProducts(allProducts.filter(p => p.category === sorted[0]));
    updateCartNav();
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--clay);grid-column:1/-1">⚠️ Could not load products. Please refresh.</p>`;
    console.error(err);
  }
}

// ── Render product cards ──
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!products.length) {
    grid.innerHTML = '<p style="color:var(--light-text);grid-column:1/-1;font-style:italic">No products in this category.</p>';
    return;
  }
  grid.innerHTML = products.map(p => {
    const qty = cart[p.id] || 0;
    const slug = p.variantGroup || p.id;
    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img ${p.colorClass || 'pi1'}">
          <div class="pat"></div>
          ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'" />` : ''}
          <span class="emoji-fallback">${p.emoji || '🧼'}</span>
        </div>
        <div class="product-info">
          <div class="product-meta">
            <span class="product-tag">${p.tag || ''}</span>
            <span class="product-cat">${p.category || ''}</span>
          </div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description || ''}</div>
          <div class="product-price">₹${p.price}</div>
          <div class="card-bottom">
            <div class="qty-control" onclick="event.stopPropagation()">
              <button class="qty-btn" onclick="event.stopPropagation();changeQty('${p.id}', -1)">−</button>
              <span class="qty-num" id="qty-${p.id}">${qty}</span>
              <button class="qty-btn" onclick="event.stopPropagation();changeQty('${p.id}', 1)">+</button>
            </div>
            <button class="add-to-order-btn ${qty > 0 ? 'selected' : ''}" id="btn-${p.id}" onclick="event.stopPropagation();addToOrder('${p.id}')">
              ${qty > 0 ? '✓ Added' : 'Add to Order'}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Cart ──
window.changeQty = function(id, delta) {
  const newQty = Math.max(0, (cart[id] || 0) + delta);
  if (newQty === 0) delete cart[id]; else cart[id] = newQty;
  const qtyEl = document.getElementById('qty-' + id);
  const btnEl = document.getElementById('btn-' + id);
  if (qtyEl) qtyEl.textContent = newQty;
  if (btnEl) { btnEl.textContent = newQty > 0 ? '✓ Added' : 'Add to Order'; btnEl.classList.toggle('selected', newQty > 0); }
  updateSummary();
  saveCartToSession();
};

window.addToOrder = function(id) {
  if (!cart[id]) cart[id] = 0;
  cart[id] = (cart[id] || 0) + 1;
  const qtyEl = document.getElementById('qty-' + id);
  const btnEl = document.getElementById('btn-' + id);
  if (qtyEl) qtyEl.textContent = cart[id];
  if (btnEl) { btnEl.textContent = '✓ Added'; btnEl.classList.add('selected'); }
  saveCartToSession();
};

window.removeFromCart = function(id) {
  delete cart[id];
  const qtyEl = document.getElementById('qty-' + id);
  const btnEl = document.getElementById('btn-' + id);
  if (qtyEl) qtyEl.textContent = 0;
  if (btnEl) { btnEl.textContent = 'Add to Order'; btnEl.classList.remove('selected'); }
  updateSummary();
  saveCartToSession();
};

// ── Cart total ──
function getCartTotal() {
  return Object.entries(cart)
    .filter(([, q]) => q > 0)
    .reduce((sum, [id, qty]) => {
      const p = allProducts.find(x => x.id === id);
      return sum + (p ? p.price * qty : 0);
    }, 0);
}

// ── Order summary table ──
function updateSummary() {
  const container = document.getElementById('summaryContent');
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  if (!items.length) {
    container.innerHTML = '<span class="empty-selection">No products added yet — set a quantity above and click "Add to Order"</span>';
    return;
  }
  let total = 0;
  const rows = items.map(([id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return '';
    const sub = p.price * qty;
    total += sub;
    return `<tr>
      <td>${p.emoji || '🧼'} ${p.name}</td>
      <td style="text-align:center">₹${p.price}</td>
      <td style="text-align:center">${qty}</td>
      <td style="text-align:right">₹${sub}</td>
      <td style="text-align:center"><button class="summary-remove" onclick="removeFromCart('${id}')" title="Remove">×</button></td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <table class="summary-table">
      <thead><tr>
        <th>Product</th><th style="text-align:center">Price</th>
        <th style="text-align:center">Qty</th><th style="text-align:right">Subtotal</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="summary-total-row">
        <td colspan="3">Total</td>
        <td style="text-align:right">₹${total}</td><td></td>
      </tr></tfoot>
    </table>`;
}

// ── Build order object ──
function buildOrder() {
  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const p = allProducts.find(x => x.id === id);
      return p ? { id, name: p.name, price: p.price, qty, subtotal: p.price * qty } : null;
    }).filter(Boolean);
  return {
    name:      document.getElementById('custName').value.trim(),
    phone:     document.getElementById('phone').value.trim(),
    email:     document.getElementById('email').value.trim(),
    address:   document.getElementById('address').value.trim(),
    notes:     document.getElementById('notes').value.trim(),
    items,
    total:     items.reduce((s, i) => s + i.subtotal, 0),
    status:    'new',
    paid:      false,
    tracking:  null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Next order number = highest existing orderNo + 1 (starts at 1000) ──
async function nextOrderNo() {
  const snap = await getDocs(collection(db, 'orders'));
  let max = 999;
  snap.forEach(d => { const n = d.data().orderNo; if (typeof n === 'number' && n > max) max = n; });
  return max + 1;
}

// ── Save order to Firestore ──
async function saveOrder() {
  const order = buildOrder();
  try { order.orderNo = await nextOrderNo(); } catch (e) { console.warn('Order number assignment failed:', e); }
  const docRef = await addDoc(collection(db, 'orders'), order);
  return { ...order, id: docRef.id };
}

// ── Validate form ──
function validateOrder() {
  const hasItems = Object.values(cart).some(q => q > 0);
  const err      = document.getElementById('errorMsg');
  const name     = document.getElementById('custName').value.trim();
  const phone    = document.getElementById('phone').value.trim();
  const address  = document.getElementById('address').value.trim();
  if (!hasItems) {
    err.textContent = '⚠️ Please add at least one product to your order.';
    err.style.display = 'block';
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  if (!name || !phone || !address) {
    err.textContent = '⚠️ Please fill in your name, phone and address.';
    err.style.display = 'block';
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  err.style.display = 'none';
  return true;
}

// ── Show success page ──
function showSuccessPage() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  let total = 0;
  const rows = items.map(([id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return '';
    const sub = p.price * qty;
    total += sub;
    return `<div class="success-order-row">
      <span>${p.emoji || '🧼'} ${p.name} × ${qty}</span>
      <span>₹${sub}</span>
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('successOrderDetails').innerHTML = rows;
  document.getElementById('successTotal').innerHTML = `<span>Total</span><span>₹${total}</span>`;
  document.getElementById('orderFormView').style.display  = 'none';
  document.getElementById('orderSuccessView').style.display = 'block';
}


// ── Reset order ──
window.resetOrder = function() {
  Object.keys(cart).forEach(id => {
    delete cart[id];
    const qtyEl = document.getElementById('qty-' + id);
    const btnEl = document.getElementById('btn-' + id);
    if (qtyEl) qtyEl.textContent = 0;
    if (btnEl) { btnEl.textContent = 'Add to Order'; btnEl.classList.remove('selected'); }
  });
  updateSummary();
  document.getElementById('orderForm').reset();
  document.getElementById('orderSuccessView').style.display = 'none';
  document.getElementById('orderFormView').style.display    = 'block';
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
};

// ── Build WhatsApp query message ──
function buildWhatsAppQueryUrl() {
  const name  = document.getElementById('custName').value.trim();
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  let msg = `Hi Pebble Store! 👋\n\n`;
  if (name) msg += `I'm ${name} and I have a query about my order.\n\n`;
  if (items.length) {
    msg += `*Products I'm interested in:*\n`;
    items.forEach(([id, qty]) => {
      const p = allProducts.find(x => x.id === id);
      if (p) msg += `• ${p.name} × ${qty} = ₹${p.price * qty}\n`;
    });
    msg += `\n*Total: ₹${getCartTotal()}*\n\n`;
  }
  msg += `Could you please help me?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ── Payment button (order form submit) ──
// TODO: Replace saveOrder() with Razorpay payment initiation when ready
const orderFormEl = document.getElementById('orderForm');
if (orderFormEl) orderFormEl.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!validateOrder()) return;

  const btn = document.getElementById('placeOrderBtn');
  if (!btn) return;
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';
  btn.querySelector('.btn-sub').textContent = 'Placing order…';

  try {
    await saveOrder();
    // ── PAYMENT INTEGRATION POINT ──
    // When Razorpay is ready, replace saveOrder() above with:
    // 1. saveOrder() to get orderId
    // 2. Open Razorpay checkout with orderId + total
    // 3. On payment success → mark order as paid in Firestore
    showSuccessPage();
  } catch (err) {
    const errEl = document.getElementById('errorMsg');
    errEl.textContent = '⚠️ Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.querySelector('.btn-sub').textContent = 'Secure checkout · Cards, UPI & more';
  }
});

// ── WhatsApp button — QR on desktop, open on mobile ──
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
let waQrGenerated = false;

const whatsappBtnEl = document.getElementById('whatsappBtn');
if (whatsappBtnEl) whatsappBtnEl.addEventListener('click', function() {
  if (isMobile) {
    // Mobile → open WhatsApp directly
    window.open(buildWhatsAppQueryUrl(), '_blank');
  } else {
    // Desktop → toggle QR panel
    const panel = document.getElementById('waQrPanel');
    const isOpen = panel.classList.contains('visible');
    if (isOpen) {
      panel.classList.remove('visible');
      document.getElementById("waBtnSub").textContent = "Questions? We'll reply instantly";
      return;
    }
    // Generate QR — wait for library if not ready yet
    function generateWaQR() {
      if (typeof QRCode === 'undefined') {
        setTimeout(generateWaQR, 100);
        return;
      }
      document.getElementById('waQrCode').innerHTML = '';
      new QRCode(document.getElementById('waQrCode'), {
        text: buildWhatsAppQueryUrl(),
        width: 180, height: 180,
        colorDark: '#2b1f14', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
    generateWaQR();
    panel.classList.add('visible');
    document.getElementById("waBtnSub").textContent = "Scan QR with your phone";
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// ── Nav scroll highlight ──
const navSections = document.querySelectorAll('section[id]');
const navLinks    = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  navSections.forEach(s => { if (window.scrollY >= s.offsetTop - 120) current = s.id; });
  navLinks.forEach(a => { a.style.color = a.getAttribute('href') === '#' + current ? 'var(--bark)' : ''; });
});

init();
