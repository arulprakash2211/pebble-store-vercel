// api/paytm.js — Paytm payment initiation
import crypto from 'crypto';

const PAYTM_MID          = 'LkRexl51254337266716';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '4&s3ImHMGm6nco8Z';
const PAYTM_WEBSITE      = 'WEBSTAGING';
const PAYTM_TXN_URL      = 'https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction';

// ── Paytm official checksum ──
function generateSignature(body, key) {
  const sortedBody = JSON.stringify(body);
  return crypto.createHmac('sha256', key).update(sortedBody).digest('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, amount, customerPhone, customerEmail } = req.body;
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'orderId and amount required' });
    }

    // Paytm requires amount as string with 2 decimal places
    const txnAmount = parseFloat(amount).toFixed(2);
    const custId    = 'CUST_' + (customerPhone || Date.now()).toString().replace(/\D/g, '').slice(-10);

    const paytmBody = {
      requestType: 'Payment',
      mid:         PAYTM_MID,
      websiteName: PAYTM_WEBSITE,
      orderId:     orderId,
      txnAmount: {
        value:    txnAmount,
        currency: 'INR'
      },
      userInfo: {
        custId:  custId,
        mobile:  (customerPhone || '').replace(/\D/g, '').slice(-10),
        email:   customerEmail || ''
      },
      enablePaymentMode: [
        { mode: 'UPI' },
        { mode: 'CREDIT_CARD' },
        { mode: 'DEBIT_CARD' },
        { mode: 'NET_BANKING' }
      ]
    };

    const head = {
      version:   '2.0',
      timestamp: Date.now().toString(),
      channelId: 'WEB',
      signature: generateSignature(paytmBody, PAYTM_MERCHANT_KEY)
    };

    console.log('Paytm request body:', JSON.stringify(paytmBody));

    const response = await fetch(
      `${PAYTM_TXN_URL}?mid=${PAYTM_MID}&orderId=${orderId}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ body: paytmBody, head })
      }
    );

    const data = await response.json();
    console.log('Paytm response:', JSON.stringify(data));

    const resultInfo = data?.body?.resultInfo;
    const txnToken   = data?.body?.txnToken;

    if (!txnToken) {
      return res.status(200).json({
        success: false,
        error:   resultInfo?.resultMsg || 'Could not get transaction token'
      });
    }

    return res.status(200).json({
      success:  true,
      txnToken,
      orderId,
      mid:    PAYTM_MID,
      amount: txnAmount
    });

  } catch (err) {
    console.error('Paytm error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
