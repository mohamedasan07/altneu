import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Razorpay Website Verification Disclosures & Invoice Invariants', () => {
  const CONFIRMED_SELLER = 'Harshan . A';
  const CONFIRMED_ADDRESS = '10/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India';
  const CONFIRMED_EMAIL = 'altneu07@gmail.com';
  const CONFIRMED_PHONE = '+91 6381245772';

  test('OrderInvoice: identifies Harshan . A, seller address, separate billing/shipping, and no false GST tax invoice claims', () => {
    const src = read('src/components/dashboard/OrderInvoice/OrderInvoice.jsx');

    // 1. Seller identity
    assert.match(src, /Harshan \. A/);
    assert.match(src, /Trading as ALTNEU/);
    assert.match(src, /Individual \/ Unregistered Business/);

    // 2. Confirmed seller address
    assert.match(src, /10\/43, Sivan Mela Vithi, Velankanni – 611111/);
    assert.match(src, /Nagapattinam, Tamil Nadu, India/);

    // 3. Separate billing and shipping blocks
    assert.match(src, /aria-label="Billed To"/);
    assert.match(src, /aria-label="Ship To"/);
    assert.match(src, /Same as shipping address/);

    // 4. Document label and tax invoice disclaimer
    assert.match(src, /Order Receipt \/ Invoice/);
    assert.match(src, /not a GST Tax Invoice/i);
    assert.doesNotMatch(src, /<h1[^>]*>Tax Invoice<\/h1>/i);
    assert.doesNotMatch(src, /GSTIN/);
  });

  test('ContactPage: includes full seller identity, principal operating address, and leadership', () => {
    const src = read('src/pages/ContactPage/ContactPage.jsx');
    assert.match(src, /Harshan \. A/);
    assert.match(src, /Trading as ALTNEU/);
    assert.match(src, /Individual \/ Unregistered Business/);
    assert.match(src, /10\/43, Sivan Mela Vithi/);
    assert.match(src, /Velankanni – 611111/);
    assert.match(src, /Nagapattinam, Tamil Nadu, India/);
    assert.match(src, new RegExp(CONFIRMED_EMAIL));
    assert.match(src, new RegExp(CONFIRMED_PHONE.replace('+', '\\+')));
  });

  test('AboutPage: includes Harshan . A as founder and grievance officer, operating address', () => {
    const src = read('src/pages/AboutPage/AboutPage.jsx');
    assert.match(src, /founder Harshan \. A/);
    assert.match(src, /Grievance Officer/);
    assert.match(src, /10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /Individual \/ Unregistered Business/);
  });

  test('TermsPage: Section 1 & 12 reflect full seller identity, business type, and operating address', () => {
    const src = read('src/pages/TermsPage/TermsPage.jsx');
    assert.match(src, /Harshan \. A trading as ALTNEU \(an Individual \/ Unregistered Business\)/);
    assert.match(src, /<strong>Legal Seller Name:<\/strong> Harshan \. A/);
    assert.match(src, /<strong>Principal Operating Address:<\/strong> 10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /<strong>Founder &amp; Grievance Officer:<\/strong> Harshan \. A/);
  });

  test('PrivacyPage: Section 1 & 7 reflect full seller identity and grievance officer details', () => {
    const src = read('src/pages/PrivacyPage/PrivacyPage.jsx');
    assert.match(src, /Harshan \. A trading as ALTNEU \(an Individual \/ Unregistered Business\)/);
    assert.match(src, /<strong>Legal Seller Name:<\/strong> Harshan \. A/);
    assert.match(src, /<strong>Principal Operating Address:<\/strong> 10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /<strong>Grievance Officer:<\/strong> Harshan \. A/);
  });

  test('RefundPage: Section 5 reflects full seller identity and operating address', () => {
    const src = read('src/pages/RefundPage/RefundPage.jsx');
    assert.match(src, /<strong>Legal Seller Name:<\/strong> Harshan \. A/);
    assert.match(src, /<strong>Principal Operating Address:<\/strong> 10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /<strong>Founder &amp; Grievance Officer:<\/strong> Harshan \. A/);
  });

  test('ShippingPage: Section 10 reflects full seller identity, address, ST Courier and ₹80 shipping fee', () => {
    const src = read('src/pages/ShippingPage/ShippingPage.jsx');
    assert.match(src, /<strong>Legal Seller Name:<\/strong> Harshan \. A/);
    assert.match(src, /<strong>Principal Operating Address:<\/strong> 10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /<strong>Founder &amp; Grievance Officer:<\/strong> Harshan \. A/);
    assert.match(src, /<strong>Delivery Partner:<\/strong> ST Courier/);
    assert.match(src, /<strong>Fixed Shipping Fee:<\/strong> ₹80 per order across serviceable locations in India/);
  });

  test('Footer: displays clean copyright, links to Seller Information, and omits residential address', () => {
    const src = read('src/components/layout/Footer/Footer.jsx');
    assert.match(src, /© ALTNEU\. All rights reserved\./);
    assert.match(src, /to:\s*'\/seller-information',\s*label:\s*'Seller Information'/);
    assert.doesNotMatch(src, /10\/43, Sivan Mela Vithi/);
    assert.doesNotMatch(src, /sellerDisclosure/);
  });

  test('SellerInformationPage: displays confirmed seller identity, principal address, support, and grievance officer', () => {
    const src = read('src/pages/SellerInformationPage/SellerInformationPage.jsx');
    assert.match(src, /<h1>|<h1[^>]*>Seller Information<\/h1>/);
    assert.match(src, /Harshan \. A/);
    assert.match(src, /ALTNEU/);
    assert.match(src, /Individual \/ Unregistered Business/);
    assert.match(src, /Principal Business Address/);
    assert.match(src, /10\/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India/);
    assert.match(src, /online-only clothing business/i);
    assert.match(src, new RegExp(CONFIRMED_EMAIL));
    assert.match(src, new RegExp(CONFIRMED_PHONE.replace('+', '\\+')));
    assert.match(src, /Grievance Officer/);
  });

  test('Tax Elimination: CartSummary and OrderSummary have no GST labels or tax collection claims', () => {
    const cartSummarySrc = read('src/components/cart/CartSummary/CartSummary.jsx');
    assert.doesNotMatch(cartSummarySrc, /GST/i);

    const orderSummarySrc = read('src/components/checkout/OrderSummary/OrderSummary.jsx');
    assert.doesNotMatch(orderSummarySrc, /GST/i);
    assert.doesNotMatch(orderSummarySrc, /Taxes and delivery are final/i);

    const termsSrc = read('src/pages/TermsPage/TermsPage.jsx');
    assert.match(termsSrc, /does not charge or collect Goods and Services Tax \(GST\) separately/);
  });
});
