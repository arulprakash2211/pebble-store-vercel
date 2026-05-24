import crypto from 'crypto';

const PAYTM_MID          = 'LkRexl51254337266716';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '4&s3ImHMGm6nco8Z';
const PAYTM_WEBSITE      = 'WEBSTAGING';
const PAYTM_INDUSTRY     = 'Retail';
const PAYTM_CHANNEL      = 'WEB';

// Paytm classic checksum — SHA256(params|salt) + salt
function generateChecksum(params, key) {
  const str = Object.keys(params)
    .sort()
    .map(k => (params[k] === null || params[k] === undefined) ? '' : params[k])
    .join('|');
  const salt  = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  const hash  = crypto.createHash('sha256').update(str + '|' + salt).digest('hex');
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

    const txnAmt  = parseFloat(amount).toFixed(2);
    const phone   = (customerPhone || '').replace(/\D/g, '').slice(-10);
    const custId  = 'CUST' + (phone || Date.now().toString().slice(-10));
    const origin  = req.headers.origin || 'https://pebble-store-vercel.vercel.app';
    const callback = `${origin}/api/paytm-callback?orderId=${orderId}`;

    // Only include params Paytm expects — no extras
    const params = {
      CALLBACK_URL:     callback,
      CHANNEL_ID:       PAYTM_CHANNEL,
      CUST_ID:          custId,
      INDUSTRY_TYPE_ID: PAYTM_INDUSTRY,
      MID:              PAYTM_MID,
      ORDER_ID:         orderId,
      TXN_AMOUNT:       txnAmt,
      WEBSITE:          PAYTM_WEBSITE,
    };

    if (phone)          params.MOBILE_NO = phone;
    if (customerEmail)  params.EMAIL     = customerEmail;

    const checksum = generateChecksum(params, PAYTM_MERCHANT_KEY);
    console.log('Params sent:', JSON.stringify(params));
    console.log('Checksum:', checksum);

    // Return to browser — browser submits form directly to Paytm
    return res.status(200).json({
      success:  true,
      params:   { ...params, CHECKSUMHASH: checksum },
      paytmUrl: 'https://securegw-stage.paytm.in/order/process',
      orderId,
      amount:   txnAmt
    });

  } catch (err) {
    console.error('Paytm error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
