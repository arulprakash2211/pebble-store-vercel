// api/paytm-callback.js — Handles Paytm POST callback
// Verifies payment and redirects to success or failure page

export default async function handler(req, res) {
  // Accept both GET and POST
  const body   = req.method === 'POST' ? req.body : {};
  const query  = req.query || {};

  const STATUS   = body.STATUS   || query.STATUS   || '';
  const ORDER_ID = body.ORDERID  || query.ORDERID  || body.ORDER_ID || query.ORDER_ID || query.orderId || '';
  const TXN_ID   = body.TXNID    || query.TXNID    || '';
  const RESPMSG  = body.RESPMSG  || query.RESPMSG  || '';

  console.log('Paytm callback:', JSON.stringify({ STATUS, ORDER_ID, TXN_ID, RESPMSG }));

  if (STATUS === 'TXN_SUCCESS') {
    // Redirect to success page
    return res.redirect(302, `/checkout.html?status=success&orderId=${ORDER_ID}&txnId=${TXN_ID}`);
  } else {
    // Redirect to failure page
    return res.redirect(302, `/checkout.html?status=failed&orderId=${ORDER_ID}&msg=${encodeURIComponent(RESPMSG)}`);
  }
}
