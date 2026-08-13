/**
 * Idempotent demo-data setup for the final assessment.
 *
 * - Renames leftover Phase/test drops to realistic sneaker names
 *   (does not delete them, so stock/reservations stay valid).
 * - Ensures the featured catalog plus extra restored sneakers exist.
 * - Purchases for the featured drops go through reservation + purchase services.
 *
 * Usage (from server/):
 *   node scripts/setup-demo-data.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Drop,
  Reservation,
  Purchase,
} = require("../src/models");
const { reserveDrop } = require("../src/services/reservationService");
const { purchaseDrop } = require("../src/services/purchaseService");

const DEMO_USERS = [
  { id: 1, name: "Alex Carter" },
  { id: 2, name: "Ryan Wilson" },
  { id: 3, name: "Daniel Brooks" },
  { id: 4, name: "Ethan Miller" },
  { id: 5, name: "Noah Anderson" },
];

const TEST_USER_NAME = /^Test User \d+$/i;
const PLACEHOLDER_USER_NAME = /^User\d+$/i;

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTestDrop(drop) {
  const name = drop.name || "";
  const description = drop.description || "";

  if (/^Phase\d+/i.test(name)) return true;
  if (/^Test /i.test(name)) return true;
  if (/Stock Guard/i.test(name)) return true;
  if (/phase\d+/i.test(description)) return true;
  if (/for reserve tests/i.test(description)) return true;
  if (/for get by id/i.test(description)) return true;
  if (/client tries to set/i.test(description)) return true;
  if (/e2e smoke/i.test(description)) return true;

  return false;
}

function isPlaceholderDrop(drop) {
  return drop.name === "Air Jordan 1";
}

const LAST_UNIT_DROP_NAME = "Air Jordan 1 Low OG";

function lastUnitDrop() {
  return {
    name: LAST_UNIT_DROP_NAME,
    description:
      "Last remaining pair of this limited drop — reserve to see sold-out behavior.",
    price: 190,
    totalStock: 1,
    startsAt: hoursFromNow(-0.1),
  };
}

function featuredDrops() {
  return [
    lastUnitDrop(),
    {
      name: "Air Jordan 1 Retro High",
      description:
        "Classic high-top silhouette with a limited-edition release.",
      price: 180,
      totalStock: 50,
      startsAt: hoursFromNow(-2),
    },
    {
      name: "Nike Dunk Low Panda",
      description: "Iconic black and white colorway with limited availability.",
      price: 140,
      totalStock: 75,
      startsAt: hoursFromNow(-1),
    },
    {
      name: "Air Jordan 4 Retro",
      description:
        "Premium retro basketball silhouette from the Jordan collection.",
      price: 210,
      totalStock: 40,
      startsAt: hoursFromNow(-0.25),
    },
    {
      name: "Nike Air Max 1",
      description: "Heritage running silhouette with a modern limited release.",
      price: 160,
      totalStock: 60,
      startsAt: hoursFromNow(4),
    },
    {
      name: "New Balance 550",
      description:
        "Classic court-inspired sneaker with a limited seasonal release.",
      price: 130,
      totalStock: 45,
      startsAt: hoursFromNow(24),
    },
    {
      name: "Nike Air Force 1 Limited",
      description:
        "Timeless low-top silhouette released in limited quantities.",
      price: 150,
      totalStock: 35,
      startsAt: hoursFromNow(72),
    },
  ];
}

/** Unique former Phase/test drops, restored as sneaker products. */
function restoredSneakers() {
  const specs = [
    {
      name: "Adidas Samba OG",
      description: "Low-profile indoor-inspired sneaker with a gum sole.",
      price: 100,
      totalStock: 55,
    },
    {
      name: "Converse Chuck 70",
      description:
        "Vintage high-top canvas sneaker with a limited seasonal run.",
      price: 90,
      totalStock: 40,
    },
    {
      name: "Vans Old Skool",
      description: "Classic skate sneaker with the signature side stripe.",
      price: 80,
      totalStock: 50,
    },
    {
      name: "Puma Suede Classic",
      description: "Heritage suede sneaker from the original Puma lineup.",
      price: 85,
      totalStock: 42,
    },
    {
      name: "Reebok Club C 85",
      description: "Clean court classic with a limited restock.",
      price: 90,
      totalStock: 38,
    },
    {
      name: "Asics Gel-Kayano 14",
      description:
        "Early-2000s running silhouette reissued in limited numbers.",
      price: 160,
      totalStock: 30,
    },
    {
      name: "Salomon XT-6",
      description:
        "Trail runner with a technical build and limited availability.",
      price: 200,
      totalStock: 25,
    },
    {
      name: "Hoka Clifton 9",
      description: "Cushioned daily trainer released as a limited drop.",
      price: 145,
      totalStock: 48,
    },
    {
      name: "New Balance 990v6",
      description: "Made-in-USA heritage runner with a limited allocation.",
      price: 200,
      totalStock: 28,
    },
    {
      name: "Nike Blazer Mid '77",
      description: "Retro basketball mid-top with vintage detailing.",
      price: 110,
      totalStock: 52,
    },
    {
      name: "Air Jordan 3 Retro",
      description: "Elephant-print basketball classic from the Jordan line.",
      price: 200,
      totalStock: 32,
    },
    {
      name: "Adidas Forum Low",
      description: "80s basketball low-top brought back as a limited release.",
      price: 100,
      totalStock: 44,
    },
    {
      name: "Nike Vomero 5",
      description: "Layered running sneaker with a modern limited colorway.",
      price: 160,
      totalStock: 36,
    },
    {
      name: "Air Jordan 11 Retro",
      description: "Patent-leather championship silhouette, limited restock.",
      price: 220,
      totalStock: 22,
    },
    {
      name: "Nike Cortez",
      description: "Original Nike running shoe in a limited heritage pack.",
      price: 90,
      totalStock: 60,
    },
    {
      name: "Adidas Superstar",
      description: "Shell-toe street classic with a limited seasonal drop.",
      price: 95,
      totalStock: 50,
    },
    {
      name: "Nike Air Max 90",
      description: "Visible-air runner with a limited colorway release.",
      price: 140,
      totalStock: 40,
    },
    {
      name: "Nike Air Max 97",
      description: "Wavy metallic runner inspired by Japanese bullet trains.",
      price: 180,
      totalStock: 28,
    },
    {
      name: "Adidas Gazelle",
      description: "Slim indoor-football sneaker with a limited suede update.",
      price: 100,
      totalStock: 45,
    },
    {
      name: "Nike SB Dunk Low",
      description: "Skate-ready Dunk with a limited shop allocation.",
      price: 125,
      totalStock: 30,
    },
    {
      name: "Air Jordan 6 Retro",
      description: "Infrared-era basketball high-top with limited stock.",
      price: 200,
      totalStock: 26,
    },
    {
      name: "Nike Pegasus 41",
      description: "Everyday running shoe released in a limited pack.",
      price: 140,
      totalStock: 55,
    },
    {
      name: "Adidas Campus 00s",
      description: "Oversized campus sneaker with a limited colorway.",
      price: 110,
      totalStock: 48,
    },
    {
      name: "New Balance 2002R",
      description: "Early-2000s running revival with limited pairs.",
      price: 140,
      totalStock: 35,
    },
    {
      name: "Air Jordan 5 Retro",
      description: "Reflective-tongue basketball sneaker, limited restock.",
      price: 210,
      totalStock: 24,
    },
    {
      name: "Nike Killshot 2",
      description: "J.Crew-era court sneaker with a limited gum-sole run.",
      price: 90,
      totalStock: 40,
    },
    {
      name: "On Cloudmonster",
      description: "Max-cushion road shoe with a limited launch allocation.",
      price: 170,
      totalStock: 30,
    },
    {
      name: "Brooks Ghost 16",
      description: "Neutral daily trainer offered as a limited drop.",
      price: 140,
      totalStock: 50,
    },
    {
      name: "Nike Dunk High",
      description: "Vintage basketball high-top with limited availability.",
      price: 135,
      totalStock: 38,
    },
    {
      name: "Air Jordan 12 Retro",
      description: "Flu-game era basketball silhouette, limited release.",
      price: 200,
      totalStock: 20,
    },
    {
      name: "Nike Air More Uptempo",
      description: "90s basketball statement sneaker with a limited restock.",
      price: 160,
      totalStock: 28,
    },
    {
      name: "New Balance 9060",
      description:
        "Chunky descendant of the 99X series, limited seasonal drop.",
      price: 150,
      totalStock: 34,
    },
    {
      name: "Adidas Handball Spezial",
      description: "Indoor handball classic reissued in limited numbers.",
      price: 110,
      totalStock: 42,
    },
    {
      name: "Nike Air Max Plus",
      description: "Tuned-air silhouette with a limited tropical colorway.",
      price: 175,
      totalStock: 30,
    },
    {
      name: "New Balance 327",
      description: "70s-inspired runner with a limited seasonal release.",
      price: 100,
      totalStock: 46,
    },
    {
      name: "Asics Gel-1130",
      description: "Early-2000s daily trainer brought back as a limited drop.",
      price: 120,
      totalStock: 40,
    },
  ];

  return specs.map((spec, index) => {
    const active = index < 18;
    return {
      ...spec,
      startsAt: active
        ? hoursFromNow(-(index % 6) - 0.5)
        : hoursFromNow(6 + (index - 18) * 8),
    };
  });
}

function shoeNamePool() {
  return [...featuredDrops(), ...restoredSneakers()].filter(
    (item) => item.name !== LAST_UNIT_DROP_NAME,
  );
}

async function renameTestDrops() {
  const drops = await Drop.findAll({ order: [["id", "ASC"]] });
  const toRename = drops.filter(
    (drop) => isTestDrop(drop) || isPlaceholderDrop(drop),
  );

  if (toRename.length === 0) {
    console.log("No Phase/test drops to rename.");
    return [];
  }

  const usedNames = new Set(drops.map((drop) => drop.name));
  const pool = shoeNamePool();
  const renamed = [];

  for (const drop of toRename) {
    const spec = pool.find((item) => !usedNames.has(item.name));
    if (!spec) {
      console.log(
        `  skip drop ${drop.id} (${drop.name}) — no unused shoe name left`,
      );
      continue;
    }

    const previous = drop.name;
    drop.name = spec.name;
    drop.description = spec.description;
    drop.price = spec.price;
    drop.startsAt = spec.startsAt;
    await drop.save();

    usedNames.add(spec.name);
    renamed.push({ id: drop.id, from: previous, to: spec.name });
    console.log(`Renamed drop ${drop.id}: ${previous} → ${spec.name}`);
  }

  return renamed;
}

async function ensureDemoUsers() {
  const created = [];
  const renamed = [];
  const kept = [];

  for (const demo of DEMO_USERS) {
    let user = await User.findByPk(demo.id);

    if (!user) {
      user = await User.findOne({ where: { name: demo.name } });
    }

    if (!user) {
      user = await User.create({ id: demo.id, name: demo.name });
      created.push(user);
      console.log(`Created user ${user.id}: ${user.name}`);
      continue;
    }

    if (user.name === demo.name) {
      kept.push(user);
      console.log(`Kept user ${user.id}: ${user.name}`);
      continue;
    }

    if (
      TEST_USER_NAME.test(user.name) ||
      PLACEHOLDER_USER_NAME.test(user.name)
    ) {
      const previous = user.name;
      user.name = demo.name;
      await user.save();
      renamed.push({ id: user.id, from: previous, to: user.name });
      console.log(`Renamed user ${user.id}: ${previous} → ${user.name}`);
      continue;
    }

    kept.push(user);
    console.log(
      `Kept existing user ${user.id}: ${user.name} (not a test name)`,
    );
  }

  return { created, renamed, kept };
}

async function removeLeftoverTestUsers() {
  const extras = await User.findAll({
    where: {
      id: { [Op.gt]: 5 },
      name: { [Op.iRegexp]: "^Test User [0-9]+$" },
    },
  });

  if (extras.length === 0) {
    console.log("No leftover test users to remove.");
    return [];
  }

  const ids = extras.map((user) => user.id);
  await sequelize.transaction(async (transaction) => {
    await Purchase.destroy({ where: { userId: ids }, transaction });
    await Reservation.destroy({ where: { userId: ids }, transaction });
    await User.destroy({ where: { id: ids }, transaction });
  });

  console.log(
    `Removed ${extras.length} leftover test users (ids ${ids.join(", ")}).`,
  );
  return extras;
}

async function ensureDropsFromCatalog(catalog, label) {
  const result = [];

  for (const spec of catalog) {
    let drop = await Drop.findOne({ where: { name: spec.name } });

    if (!drop) {
      const stock = spec.totalStock;
      drop = await Drop.create({
        name: spec.name,
        description: spec.description,
        price: spec.price,
        totalStock: stock,
        availableStock: stock,
        startsAt: spec.startsAt,
      });
      console.log(`Created ${label} ${drop.id}: ${drop.name} (stock ${stock})`);
      result.push({ drop, created: true });
      continue;
    }

    drop.description = spec.description;
    drop.price = spec.price;
    drop.startsAt = spec.startsAt;
    await drop.save();
    console.log(`Updated ${label} ${drop.id}: ${drop.name}`);
    result.push({ drop, created: false });
  }

  return result;
}

async function ensurePurchase(dropId, userId) {
  const existing = await Purchase.findOne({ where: { dropId, userId } });
  if (existing) {
    console.log(
      `  skip purchase user ${userId} on drop ${dropId} (already exists)`,
    );
    return false;
  }

  try {
    await reserveDrop({ dropId, userId, quantity: 1 });
  } catch (err) {
    if (
      !(
        err.status === 409 &&
        /already have an active reservation/i.test(err.message)
      )
    ) {
      throw err;
    }
  }

  await sleep(40);
  await purchaseDrop({ dropId, userId });
  console.log(`  purchased drop ${dropId} as user ${userId}`);
  return true;
}

async function resetLastUnitDrop() {
  const spec = lastUnitDrop();
  const drop = await Drop.findOne({ where: { name: spec.name } });
  if (!drop) {
    throw new Error(`Missing last-unit drop: ${spec.name}`);
  }

  await sequelize.transaction(async (transaction) => {
    await Purchase.destroy({ where: { dropId: drop.id }, transaction });
    await Reservation.destroy({ where: { dropId: drop.id }, transaction });

    drop.totalStock = 1;
    drop.availableStock = 1;
    drop.startsAt = spec.startsAt;
    drop.description = spec.description;
    drop.price = spec.price;
    await drop.save({ transaction });
  });

  console.log(
    `Last-unit drop ${drop.id}: ${drop.name} reset to availableStock=1 (no holds).`,
  );
  return drop;
}

async function addPurchaseActivity(dropsByName) {
  const plan = [
    { name: "Air Jordan 1 Retro High", userIds: [1, 2] },
    { name: "Nike Dunk Low Panda", userIds: [3, 4, 5] },
    { name: "Air Jordan 4 Retro", userIds: [2] },
  ];

  let added = 0;

  for (const item of plan) {
    const drop = dropsByName.get(item.name);
    if (!drop) {
      throw new Error(`Missing demo drop: ${item.name}`);
    }

    console.log(`Purchase activity for ${item.name}:`);
    for (const userId of item.userIds) {
      const created = await ensurePurchase(drop.id, userId);
      if (created) added += 1;
    }
  }

  return added;
}

async function verifyStockConsistency() {
  const drops = await Drop.findAll({ order: [["startsAt", "ASC"]] });
  const problems = [];

  for (const drop of drops) {
    if (drop.availableStock < 0 || drop.availableStock > drop.totalStock) {
      problems.push(
        `drop ${drop.id} stock invalid: available=${drop.availableStock} total=${drop.totalStock}`,
      );
    }

    const held = await Reservation.sum("quantity", {
      where: {
        dropId: drop.id,
        status: { [Op.in]: ["active", "completed"] },
      },
    });
    const expected = drop.totalStock - (held || 0);
    if (drop.availableStock !== expected) {
      problems.push(
        `drop ${drop.id} (${drop.name}) availableStock=${drop.availableStock}, expected ${expected} (total ${drop.totalStock} - held ${held || 0})`,
      );
    }
  }

  if (problems.length) {
    throw new Error(`Stock consistency failed:\n${problems.join("\n")}`);
  }

  console.log(
    "Stock consistency OK (totalStock >= availableStock >= 0, matches reservations).",
  );
  return drops;
}

async function main() {
  console.log("SneakerDrop demo data setup\n");
  await sequelize.authenticate();

  await renameTestDrops();
  console.log("");

  await ensureDemoUsers();
  console.log("");

  await removeLeftoverTestUsers();
  console.log("");

  const featured = await ensureDropsFromCatalog(
    featuredDrops(),
    "featured drop",
  );
  console.log("");
  await ensureDropsFromCatalog(restoredSneakers(), "restored drop");
  console.log("");

  const dropsByName = new Map(featured.map(({ drop }) => [drop.name, drop]));
  await resetLastUnitDrop();
  console.log("");

  const addedPurchases = await addPurchaseActivity(dropsByName);
  console.log(`Purchase records added this run: ${addedPurchases}\n`);

  const drops = await verifyStockConsistency();

  console.log("\nRemaining drops:");
  for (const drop of drops) {
    const purchasers = await Purchase.count({ where: { dropId: drop.id } });
    const when = new Date(drop.startsAt) <= new Date() ? "active" : "upcoming";
    console.log(
      `  ${drop.id} ${drop.name}  $${drop.price}  ${drop.availableStock}/${drop.totalStock}  ${when}  purchasers=${purchasers}`,
    );
  }

  const users = await User.findAll({ order: [["id", "ASC"]] });
  console.log("\nUsers:");
  for (const user of users) {
    console.log(`  ${user.id} ${user.name}`);
  }

  console.log("\nDemo data setup complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
