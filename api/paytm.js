import crypto from 'crypto';

const PAYTM_MID          = 'LkRexl51254337266716';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '4&s3ImHMGm6nco8Z';
const PAYTM_WEBSITE      = 'WEBSTAGING';

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

    const paytmBody = {
      requestType: 'Payment',
      mid:         PAYTM_MID,
      websiteName: PAYTM_WEBSITE,
      orderId:     orderId,
      txnAmount:   { value: txnAmt, currency: 'INR' },
      userInfo:    { custId, mobile: phone, email: customerEmail || '' }
    };

    // ── Correct signature: HMAC-SHA256 of JSON body string ──
    const bodyString  = JSON.stringify(paytmBody);
    const signature   = crypto.createHmac('sha256', PAYTM_MERCHANT_KEY)
                              .update(bodyString)
                              .digest('base64');

    console.log('Body string:', bodyString);
    console.log('Signature:', signature);

    const response = await fetch(
      `https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction?mid=${PAYTM_MID}&orderId=${orderId}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          body: paytmBody,
          head: { signature }
        })
      }
    );

    const data = await response.json();
    console.log('Paytm response:', JSON.stringify(data));

    const txnToken = data?.body?.txnToken;
    if (!txnToken) {
      return res.status(200).json({
        success: false,
        error:   data?.body?.resultInfo?.resultMsg || 'Failed to get token'
      });
    }

    return res.status(200).json({ success: true, txnToken, orderId, mid: PAYTM_MID, amount: txnAmt });

  } catch (err) {
    console.error('Paytm error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
