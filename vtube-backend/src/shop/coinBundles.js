/**
 * coinBundles.js — Hoshi Coin bundle definitions
 * Price IDs provided by Leni (Stripe test mode)
 */

export const COIN_BUNDLES = [
  { id: 'otanoshimi',   name: 'Otanoshimi',    coins: 100,  price_usd: 0.99,  price_id: 'price_1TJZx0KDO6vyNeNrYmpc8RVb' },
  { id: 'otsukare',     name: 'Otsukare',      coins: 600,  price_usd: 4.99,  price_id: 'price_1TJZyrKDO6vyNeNrQ92kgTIq' },
  { id: 'daisuki',      name: 'Daisuki',        coins: 1500, price_usd: 9.99,  price_id: 'price_1TJZzEKDO6vyNeNr3AVXtv6B' },
];

export function getBundleByPriceId(priceId) {
  return COIN_BUNDLES.find(b => b.price_id === priceId) || null;
}
