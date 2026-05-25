// api/razorpay.js — Create Razorpay order server-side

const RAZORPAY_KEY_ID     = 'rzp_test_StQagv6ZWoTbna';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'vEebtBi94fUQ6nxi8k3Y4s5I';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount)  return res.status(400).json({ error: 'orderId and amount required' });

    // Razorpay amount is in paise (multiply by 100)
    const amountPaise = Math.round(parseFloat(amount) * 100);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
      },
      body: JSON.stringify({
        amount:          amountPaise,
        currency:        'INR',
        receipt:         orderId,
        payment_capture: 1
      })
    });

    const data = await response.json();
    console.log('Razorpay order:', JSON.stringify(data));

    if (data.error) {
      return res.status(200).json({ success: false, error: data.error.description || 'Failed to create order' });
    }

    return res.status(200).json({
      success:         true,
      razorpayOrderId: data.id,
      amount:          data.amount,
      currency:        data.currency,
      keyId:           RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error('Razorpay error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
