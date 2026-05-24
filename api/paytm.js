import crypto from 'crypto';

const PAYTM_MID          = 'LkRexl51254337266716';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '4&s3ImHMGm6nco8Z';
const PAYTM_WEBSITE      = 'WEBSTAGING';
const PAYTM_INDUSTRY     = 'Retail';
const PAYTM_CHANNEL      = 'WEB';

// Official Paytm v1 checksum (non-HMAC version)
function generateChecksum(params, key) {
  const sortedKeys = Object.keys(params).sort();
  const str = sortedKeys.map(k => params[k] ?? '').join('|');
  const salt = crypto.randomBytes(4).toString('hex');
  const hash = crypto.createHash('sha256').update(str + '|' + salt).digest('hex');
  return hash + salt;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, amount, customerPhone, customerEmail } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    const txnAmt = parseFloat(amount).toFixed(2);
    const phone  = (customerPhone || '').replace(/\D/g, '').slice(-10);
    const custId = 'CUST' + (phone || Date.now().toString().slice(-10));
    const origin = req.headers.origin || 'https://pebble-store-vercel.vercel.app';

    const params = {
      MID:              PAYTM_MID,
      WEBSITE:          PAYTM_WEBSITE,
      CHANNEL_ID:       PAYTM_CHANNEL,
      INDUSTRY_TYPE_ID: PAYTM_INDUSTRY,
      ORDER_ID:         orderId,
      CUST_ID:          custId,
      TXN_AMOUNT:       txnAmt,
      CURRENCY:         'INR',
      CALLBACK_URL:     `${origin}/checkout.html?callback=1&orderId=${orderId}`,
      ...(phone && { MOBILE_NO: phone }),
      ...(customerEmail && { EMAIL: customerEmail })
    };

    const checksum = generateChecksum(params, PAYTM_MERCHANT_KEY);

    console.log('Params:', JSON.stringify({ ...params }));
    console.log('Checksum:', checksum);

    return res.status(200).json({
      success:  true,
      params:   { ...params, CHECKSUMHASH: checksum },
      mid:      PAYTM_MID,
      orderId,
      amount:   txnAmt,
      paytmUrl: 'https://securegw-stage.paytm.in/order/process'
    });

  } catch (err) {
    console.error('Paytm error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
