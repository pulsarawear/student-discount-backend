const sgMail = require('@sendgrid/mail');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ALLOWED_DOMAINS = ['.edu']; // USA university emails only

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function isStudentEmail(email) {
  return ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
}

async function createShopifyDiscountCode(discountCode) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;

  const priceRuleRes = await fetch(
    `https://${shop}/admin/api/2023-10/price_rules.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        price_rule: {
          title: discountCode,
          target_type: 'line_item',
          target_selection: 'all',
          allocation_method: 'across',
          value_type: 'percentage',
          value: '-10.0',
          customer_selection: 'all',
          starts_at: new Date().toISOString(),
          usage_limit: 1,
        },
      }),
    }
  );

  const priceRuleData = await priceRuleRes.json();
  const priceRuleId = priceRuleData.price_rule.id;

  const discountRes = await fetch(
    `https://${shop}/admin/api/2023-10/price_rules/${priceRuleId}/discount_codes.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        discount_code: { code: discountCode },
      }),
    }
  );

  const discountData = await discountRes.json();
  return discountData.discount_code.code;
}

async function sendDiscountEmail(toEmail, studentName, discountCode) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const storeUrl = `https://${shop}/discount/${discountCode}`;

  const msg = {
    to: toEmail,
    from: process.env.FROM_EMAIL,
    subject: 'Your Student Discount Code',
    html: `
      <p>Hi ${studentName},</p>
      <p>Thanks for verifying your student status! Here is your exclusive 10% discount code:</p>
      <h2 style="color: #4a90e2;">${discountCode}</h2>
      <p>
        <a href="${storeUrl}" style="background:#4a90e2;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">
          Click here to apply your discount
        </a>
      </p>
      <p>This code is single-use and was issued to your university email address.</p>
      <p>Happy shopping!</p>
    `,
  };

  await sgMail.send(msg);
}

function generateDiscountCode(email) {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `STUDENT-${rand}`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Please provide your name and university email.' });
    }

    if (!isStudentEmail(email)) {
      return res.status(400).json({
        error: 'Please use your US university email address (must end in .edu) to apply.',
      });
    }

    const discountCode = generateDiscountCode(email);
    await createShopifyDiscountCode(discountCode);
    await sendDiscountEmail(email, name, discountCode);

    return res.status(200).json({
      success: true,
      message: 'Verified! Check your university email for your discount code.',
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
