/**
 * giftCatalogue.js — All v1 gift items seeded from the Sprint 3 brief
 *
 * Categories: food, drink, snack, comfort, affection, daily_care,
 *             accessory, seasonal, outfit, lucky, flowers, tegami, idol, milestone, premium
 */

export const GIFT_CATALOGUE = [
  // ── Care items ─────────────────────────────────────────────────────────────
  { id: 'onigiri',         name: 'Onigiri',              name_jp: 'おにぎり',       coin_cost: 20,   category: 'food',       genki_boost: 5,  duration_days: null, is_seasonal: false },
  { id: 'ramen',           name: 'Ramen Bowl',           name_jp: 'ラーメン',        coin_cost: 50,   category: 'food',       genki_boost: 10, duration_days: null, is_seasonal: false },
  { id: 'matcha_latte',    name: 'Matcha Latte',         name_jp: '抹茶ラテ',        coin_cost: 30,   category: 'drink',      genki_boost: 7,  duration_days: null, is_seasonal: false },
  { id: 'taiyaki',         name: 'Taiyaki',              name_jp: '鯛焼き',          coin_cost: 40,   category: 'snack',      genki_boost: 8,  duration_days: null, is_seasonal: false },
  { id: 'daifuku',         name: 'Strawberry Daifuku',   name_jp: 'いちご大福',      coin_cost: 35,   category: 'snack',      genki_boost: 7,  duration_days: null, is_seasonal: false },
  { id: 'warm_blanket',    name: 'Warm Blanket',         name_jp: 'あったかブランケット', coin_cost: 60, category: 'comfort',  genki_boost: 12, duration_days: null, is_seasonal: false },
  { id: 'head_pat',        name: 'Head Pat',             name_jp: '頭なでなで',      coin_cost: 25,   category: 'affection',  genki_boost: 6,  duration_days: null, is_seasonal: false },
  { id: 'morning_card',    name: 'Morning Greeting Card', name_jp: 'おはようカード',  coin_cost: 15,   category: 'daily_care', genki_boost: 3,  duration_days: null, is_seasonal: false },

  // ── Accessories ────────────────────────────────────────────────────────────
  { id: 'hair_ribbon',     name: 'Hair Ribbon',          name_jp: 'ヘアリボン',      coin_cost: 150,  category: 'accessory',  genki_boost: 0,  duration_days: 7,    is_seasonal: false },
  { id: 'cat_ear_clip',    name: 'Cat Ear Clip',         name_jp: '猫耳クリップ',     coin_cost: 200,  category: 'accessory',  genki_boost: 0,  duration_days: 7,    is_seasonal: false },
  { id: 'flower_crown',    name: 'Flower Crown',         name_jp: '花冠',           coin_cost: 180,  category: 'seasonal',   genki_boost: 0,  duration_days: 7,    is_seasonal: true  },
  { id: 'star_hairpin',    name: 'Star Hairpin',         name_jp: 'スターヘアピン',   coin_cost: 120,  category: 'accessory',  genki_boost: 0,  duration_days: 7,    is_seasonal: false },
  { id: 'school_bag_charm',name: 'School Bag Charm',     name_jp: 'カバンチャーム',   coin_cost: 100,  category: 'accessory',  genki_boost: 0,  duration_days: 7,    is_seasonal: false },

  // ── Outfits ────────────────────────────────────────────────────────────────
  { id: 'summer_yukata',   name: 'Summer Yukata',        name_jp: '夏の浴衣',        coin_cost: 500,  category: 'outfit',     genki_boost: 0,  duration_days: 30,   is_seasonal: true  },
  { id: 'winter_kotatsu',  name: 'Winter Kotatsu Set',   name_jp: 'こたつセット',     coin_cost: 600,  category: 'outfit',     genki_boost: 0,  duration_days: 30,   is_seasonal: true  },
  { id: 'school_uniform',  name: 'School Uniform',       name_jp: '制服',           coin_cost: 450,  category: 'outfit',     genki_boost: 0,  duration_days: 14,   is_seasonal: true  },
  { id: 'idol_outfit',     name: 'Idol Stage Outfit',    name_jp: 'アイドル衣装',     coin_cost: 800,  category: 'outfit',     genki_boost: 0,  duration_days: 30,   is_seasonal: true  },
  { id: 'maid_uniform',    name: 'Maid Café Uniform',    name_jp: 'メイド服',        coin_cost: 600,  category: 'outfit',     genki_boost: 0,  duration_days: 14,   is_seasonal: false },

  // ── Special / high-value ───────────────────────────────────────────────────
  { id: 'omamori',         name: 'Omamori Charm',        name_jp: 'お守り',          coin_cost: 300,  category: 'lucky',      genki_boost: 0,  duration_days: 1,    is_seasonal: false },
  { id: 'sakura_bouquet',  name: 'Sakura Bouquet',       name_jp: '桜の花束',        coin_cost: 400,  category: 'flowers',    genki_boost: 100, duration_days: null, is_seasonal: true  },
  { id: 'handwritten_letter', name: 'Handwritten Letter', name_jp: '手紙',           coin_cost: 250,  category: 'tegami',     genki_boost: 15, duration_days: null, is_seasonal: false },
  { id: 'uchiwa_fan',      name: 'Uchiwa Fan',           name_jp: 'うちわ',          coin_cost: 350,  category: 'idol',       genki_boost: 0,  duration_days: null, is_seasonal: false },
  { id: 'birthday_cake',   name: 'Birthday Cake',        name_jp: 'バースデーケーキ',  coin_cost: 1000, category: 'milestone',  genki_boost: 0,  duration_days: null, is_seasonal: false },
  { id: 'shooting_star',   name: 'Shooting Star',        name_jp: '流れ星',          coin_cost: 2000, category: 'premium',    genki_boost: 0,  duration_days: null, is_seasonal: false },
];

export function getGift(giftId) {
  return GIFT_CATALOGUE.find(g => g.id === giftId) || null;
}
