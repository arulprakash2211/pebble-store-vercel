/* ═══════════════════════════════════════
   PEBBLE STORE – app.js
   Reads products directly from Firestore
   ═══════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs, addDoc, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyA-tA1L4XZk644INv5Hu2_iySOjVMkzpPo",
  authDomain: "pebble-store-70889.firebaseapp.com",
  projectId: "pebble-store-70889",
  storageBucket: "pebble-store-70889.firebasestorage.app",
  messagingSenderId: "611731436877",
  appId: "1:611731436877:web:eee0ef64cd8b4b86467304"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const WHATSAPP_NUMBER = '919659451260';
let allProducts = [];
const cart = {};
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// ── Boot ──
async function init() {
  initDevice();
  await loadProducts();
}

// ── Device detection ──
function initDevice() {
  if (isMobile) {
    document.getElementById('mobileActions').style.display = 'block';
  } else {
    document.getElementById('desktopActions').style.display = 'block';
    generateQR();
  }
}

// ── Load products from Firestore ──
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  const filtersEl = document.getElementById('categoryFilters');
  try {
    const snap = await getDocs(collection(db, 'products'));
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!allProducts.length) {
      grid.innerHTML = '<p style="color:var(--light-text);grid-column:1/-1;font-style:italic">No products yet. Check back soon!</p>';
      return;
    }

    const categories = ['All', ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    filtersEl.innerHTML = categories.map((cat, i) =>
      `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join('');

    filtersEl.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts(btn.dataset.cat === 'All' ? allProducts : allProducts.filter(p => p.category === btn.dataset.cat));
      });
    });

    renderProducts(allProducts);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--clay);grid-column:1/-1">⚠️ Could not load products. Please refresh. (${err.message})</p>`;
    console.error(err);
  }
}

// ── Render product cards ──
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!products.length) {
    grid.innerHTML = '<p style="color:var(--light-text);grid-column:1/-1;font-style:italic">No products in this category yet.</p>';
    return;
  }
  grid.innerHTML = products.map(p => {
    const qty = cart[p.id] || 0;
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
          <div class="product-price">₹${p.price} / bar</div>
          <div class="card-bottom">
            <div class="qty-control">
              <button class="qty-btn" onclick="changeQty('${p.id}', -1)">−</button>
              <span class="qty-num" id="qty-${p.id}">${qty}</span>
              <button class="qty-btn" onclick="changeQty('${p.id}', 1)">+</button>
            </div>
            <button class="add-to-order-btn ${qty > 0 ? 'selected' : ''}" id="btn-${p.id}" onclick="addToOrder('${p.id}')">
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
  if (!isMobile) refreshQR();
};

window.addToOrder = function(id) {
  if (!cart[id]) {
    cart[id] = 1;
    const qtyEl = document.getElementById('qty-' + id);
    const btnEl = document.getElementById('btn-' + id);
    if (qtyEl) qtyEl.textContent = 1;
    if (btnEl) { btnEl.textContent = '✓ Added'; btnEl.classList.add('selected'); }
  }
  updateSummary();
  if (!isMobile) refreshQR();
  document.getElementById('order').scrollIntoView({ behavior: 'smooth' });
};

window.removeFromCart = function(id) {
  delete cart[id];
  const qtyEl = document.getElementById('qty-' + id);
  const btnEl = document.getElementById('btn-' + id);
  if (qtyEl) qtyEl.textContent = 0;
  if (btnEl) { btnEl.textContent = 'Add to Order'; btnEl.classList.remove('selected'); }
  updateSummary();
  if (!isMobile) refreshQR();
};

// ── Order summary ──
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

// ── Build order ──
function buildOrder(orderVia) {
  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const p = allProducts.find(x => x.id === id);
      return p ? { id, name: p.name, price: p.price, qty, subtotal: p.price * qty } : null;
    }).filter(Boolean);
  return {
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    address: document.getElementById('address').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    items,
    total: items.reduce((s, i) => s + i.subtotal, 0),
    orderVia,
    status: 'new',
    paid: false,
    createdAt: new Date().toISOString()
  };
}

// ── Save order to Firestore ──
async function saveOrder(orderVia) {
  const order = buildOrder(orderVia);
  await addDoc(collection(db, 'orders'), order);
  return order;
}

// ── WhatsApp ──
function buildWhatsAppUrl() {
  const name    = document.getElementById('custName').value.trim();
  const phone   = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const notes   = document.getElementById('notes').value.trim();
  let total = 0;
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return '';
    total += p.price * qty;
    return `• ${p.name} x${qty} = ₹${p.price * qty}`;
  }).filter(Boolean).join('\n');
  let msg = `🛒 *New Order – Pebble Store*\n\n`;
  if (name)    msg += `*Name:* ${name}\n`;
  if (phone)   msg += `*Phone:* ${phone}\n`;
  if (address) msg += `*Address:* ${address}\n`;
  msg += `\n*Order:*\n${lines}\n\n*Total: ₹${total}*`;
  if (notes)   msg += `\n\n*Notes:* ${notes}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ── QR Code ──
function generateQR() {
  if (typeof QRCode === 'undefined') return;
  const container = document.getElementById('qrCode');
  container.innerHTML = '';
  new QRCode(container, { text: `https://wa.me/${WHATSAPP_NUMBER}`, width: 180, height: 180, colorDark: '#2b1f14', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function refreshQR() {
  if (typeof QRCode === 'undefined') return;
  const container = document.getElementById('qrCode');
  container.innerHTML = '';
  new QRCode(container, { text: buildWhatsAppUrl(), width: 180, height: 180, colorDark: '#2b1f14', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

// ── Validate ──
function validateOrder() {
  const hasItems = Object.values(cart).some(q => q > 0);
  const err = document.getElementById('errorMsg');
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  if (!hasItems) { err.textContent = '⚠️ Please add at least one product.'; err.style.display = 'block'; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  if (!name || !phone || !address) { err.textContent = '⚠️ Please fill in your name, phone and address.'; err.style.display = 'block'; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  err.style.display = 'none';
  return true;
}

// ── Success page ──
function showSuccessPage() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  let total = 0;
  const rows = items.map(([id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return '';
    const sub = p.price * qty;
    total += sub;
    return `<div class="success-order-row"><span>${p.emoji || '🧼'} ${p.name} × ${qty}</span><span>₹${sub}</span></div>`;
  }).filter(Boolean).join('');
  document.getElementById('successOrderDetails').innerHTML = rows;
  document.getElementById('successTotal').innerHTML = `<span>Total</span><span>₹${total}</span>`;
  document.getElementById('orderFormView').style.display = 'none';
  document.getElementById('orderSuccessView').style.display = 'block';
  document.getElementById('order').scrollIntoView({ behavior: 'smooth' });
}

// ── Reset ──
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
  document.getElementById('orderFormView').style.display = 'block';
  if (!isMobile) generateQR();
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
};

// ── Send email via Formspree ──
async function sendEmailViaFormspree(order) {
  const itemsList = order.items.map(i => `${i.name} x${i.qty} = Rs.${i.subtotal}`).join(', ');
  const formData = new FormData();
  formData.append('name', order.name);
  formData.append('phone', order.phone);
  formData.append('email', order.email);
  formData.append('address', order.address);
  formData.append('order_details', itemsList);
  formData.append('order_total', 'Rs.' + order.total);
  formData.append('order_via', order.orderVia);
  formData.append('notes', order.notes || '');
  const res = await fetch('https://formspree.io/f/xdabogzl', {
    method: 'POST', body: formData,
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) console.warn('Formspree email failed');
}

// ── Email submit ──
document.getElementById('orderForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!validateOrder()) return;
  const btn = this.querySelector('button[type="submit"]');
  btn.textContent = 'Sending…'; btn.disabled = true;
  try {
    const order = await saveOrder('Email');
    // Send email via Formspree in parallel (don't block success page)
    sendEmailViaFormspree(order).catch(err => console.warn('Email error:', err));
    showSuccessPage();
  } catch (err) {
    document.getElementById('errorMsg').textContent = '⚠️ Something went wrong. Please try WhatsApp.';
    document.getElementById('errorMsg').style.display = 'block';
    btn.textContent = '📧 Send Order by Email'; btn.disabled = false;
  }
});

// ── WhatsApp button ──
const waBtn = document.getElementById('whatsappBtn');
if (waBtn) {
  waBtn.addEventListener('click', async function() {
    if (!validateOrder()) return;
    try { await saveOrder('WhatsApp'); } catch (err) { console.warn('Save failed', err); }
    window.open(buildWhatsAppUrl(), '_blank');
    setTimeout(showSuccessPage, 800);
  });
}

// ── Nav scroll ──
const navSections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  navSections.forEach(s => { if (window.scrollY >= s.offsetTop - 120) current = s.id; });
  navLinks.forEach(a => { a.style.color = a.getAttribute('href') === '#' + current ? 'var(--bark)' : ''; });
});

init();
