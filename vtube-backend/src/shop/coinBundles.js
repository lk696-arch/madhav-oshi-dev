/**
 * coinBundles.js — Hoshi Coin bundle definitions
 * Price IDs provided by Leni (Stripe test mode)
 */

// Price IDs for the three bundles Leni set up in Stripe.
// Oshi Forever and Ichiban are v2 — price IDs not yet created.
// All price IDs must be test-mode (price_test_...) when using sk_test_ key.
// Waiting on Leni to create test-mode prices in Stripe dashboard.
// Live-mode price IDs with a test-mode key cause Stripe to reject + crash.
export const COIN_BUNDLES = [
  { id: 'otanoshimi',    name: 'Otanoshimi',    coins: 100,  price_usd: 0.99,  price_id: null },
  { id: 'otsukare',      name: 'Otsukare',      coins: 500,  price_usd: 4.99,  price_id: null },
  { id: 'daisuki',       name: 'Daisuki ★',     coins: 1200, price_usd: 9.99,  price_id: null },
  { id: 'oshi_forever',  name: 'Oshi Forever',  coins: 2800, price_usd: 19.99, price_id: null },
  { id: 'ichiban',       name: 'Ichiban',        coins: 6500, price_usd: 39.99, price_id: null },
];

export function getBundleByPriceId(priceId) {
  return COIN_BUNDLES.find(b => b.price_id === priceId) || null;
}
