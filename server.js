require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const path = require('path');
const compression = require('compression');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3030;

app.use(compression());
app.use(express.json());
app.use(express.static(__dirname, {
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'thesignalsinstitute' });
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 50 || amount > 999999) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`The Signals Institute server running on port ${PORT}`);
});

process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });
