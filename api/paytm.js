// api/paytm.js — Generate Paytm checksum server-side
// Merchant key stays secret on the server

import crypto from 'crypto';

const PAYTM_MID         = 'LkRexl51254337266716';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '4&s3ImHMGm6nco8Z';
const PAYTM_WEBSITE      = 'WEBSTAGING';
const PAYTM_INDUSTRY     = 'Retail';
const PAYTM_CHANNEL      = 'WEB';
const PAYTM_TXN_URL      = 'https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction';

// ── Generate checksum ──
function generateChecksum(params, key) {
  const sortedKeys = Object.keys(params).sort();
  const paramStr = sortedKeys.map(k => `${k}=${params[k]}`).join('|');
  const salt = crypto.randomBytes(4).toString('hex');
  const hashed = crypto.createHmac('sha256', key).update(paramStr + '|' + salt).digest('hex');
  return hashed + salt;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount, customerId, customerPhone, customerEmail } = req.body;
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount required' });
  }

  const params = {
    MID:         PAYTM_MID,
    WEBSITE:     PAYTM_WEBSITE,
    INDUSTRY_TYPE_ID: PAYTM_INDUSTRY,
    CHANNEL_ID:  PAYTM_CHANNEL,
    ORDER_ID:    orderId,
    CUST_ID:     customerId || customerPhone || 'CUST_' + Date.now(),
    MOBILE_NO:   customerPhone || '',
    EMAIL:       customerEmail || '',
    TXN_AMOUNT:  amount.toString(),
    CALLBACK_URL: `${req.headers.origin || 'https://pebble-store-vercel.vercel.app'}/checkout.html?status=callback`,
  };

  const checksum = generateChecksum(params, PAYTM_MERCHANT_KEY);
  params.CHECKSUMHASH = checksum;

  try {
    // Initiate transaction with Paytm
    const response = await fetch(PAYTM_TXN_URL + `?mid=${PAYTM_MID}&orderId=${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          requestType:   'Payment',
          mid:           PAYTM_MID,
          websiteName:   PAYTM_WEBSITE,
          orderId,
          txnAmount: { value: amount.toString(), currency: 'INR' },
          userInfo: {
            custId:    customerId || 'CUST_' + Date.now(),
            mobile:    customerPhone || '',
            email:     customerEmail || ''
          },
          callbackUrl: params.CALLBACK_URL
        },
        head: { signature: checksum }
      })
    });

    const data = await response.json();
    return res.status(200).json({
      success: true,
      txnToken: data?.body?.txnToken,
      orderId,
      mid:    PAYTM_MID,
      amount: amount.toString(),
      params
    });
  } catch (err) {
    console.error('Paytm init error:', err);
    return res.status(500).json({ error: 'Failed to initiate payment: ' + err.message });
  }
}
