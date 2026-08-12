/**
 * Phase 6 purchase flow verification script.
 *
 * Run while the API is listening on PORT (default 5000):
 *   node scripts/phase6-purchase-test.js
 */
require('dotenv').config();

const { sequelize, Drop, Reservation, Purchase } = require('../src/models');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20000;

async function request(method, path, { headers = {}, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(label, checkFn) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await checkFn()) {
      console.log(`  worker applied change (${label})`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`FAIL: timed out waiting for worker — ${label}`);
}

async function createDrop(name, totalStock) {
  const res = await request('POST', '/api/drops', {
    body: {
      name,
      description: 'phase6 purchase test',
      price: 180,
      totalStock,
      startsAt: new Date().toISOString(),
    },
  });
  assert(res.status === 201, `create drop "${name}"`);
  return res.json.data;
}

async function reserve(dropId, userId, quantity = 1) {
  return request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': String(userId) },
    body: { quantity },
  });
}

async function purchase(dropId, userId) {
  return request('POST', `/api/drops/${dropId}/purchase`, {
    headers: { 'X-User-Id': String(userId) },
  });
}

async function backdateExpiresAt(reservationId) {
  const reservation = await Reservation.findByPk(reservationId);
  reservation.expiresAt = new Date(Date.now() - 1000);
  await reservation.save();
}

async function main() {
  console.log('Phase 6 purchase tests\n');

  // --- Test 1: Successful purchase ---
  console.log('1) Successful purchase');
  const drop1 = await createDrop('Phase6 Success', 10);
  const r1 = await reserve(drop1.id, 1);
  assert(r1.status === 201, 'reserve returns 201');
  assert(r1.json.data.availableStock === 9, 'stock is 9 after reserve');

  const p1 = await purchase(drop1.id, 1);
  assert(p1.status === 201, 'purchase returns 201');
  assert(p1.json.data.dropId === drop1.id, 'purchase dropId matches');
  assert(p1.json.data.userId === 1, 'purchase userId is 1');
  assert(p1.json.data.reservationId === r1.json.data.reservationId, 'reservationId matches');
  assert(p1.json.data.quantity === 1, 'quantity is 1');
  assert(typeof p1.json.data.purchaseId === 'number', 'has purchaseId');
  assert(p1.json.data.availableStock === 9, 'availableStock unchanged (still 9)');

  const reservation1 = await Reservation.findByPk(r1.json.data.reservationId);
  assert(reservation1.status === 'completed', 'reservation status is completed');

  const purchaseRow = await Purchase.findByPk(p1.json.data.purchaseId);
  assert(!!purchaseRow, 'purchase record exists');
  assert(purchaseRow.reservationId === reservation1.id, 'purchase linked to reservation');

  const drop1After = await Drop.findByPk(drop1.id);
  assert(drop1After.availableStock === 9, 'DB availableStock still 9 (not restored)');

  // --- Test 2: Cannot purchase without reservation ---
  console.log('\n2) Cannot purchase without reservation');
  const drop2 = await createDrop('Phase6 No Reserve', 5);
  const p2 = await purchase(drop2.id, 1);
  assert(p2.status === 400, 'returns 400');
  assert(/no active reservation/i.test(p2.json.message), 'message mentions no active reservation');

  // --- Test 3: Cannot purchase someone else's reservation ---
  console.log("\n3) Cannot purchase someone else's reservation");
  const drop3 = await createDrop('Phase6 Other User', 5);
  const r3 = await reserve(drop3.id, 1);
  assert(r3.status === 201, 'user 1 reserves');
  const p3 = await purchase(drop3.id, 2);
  assert(p3.status === 400, 'user 2 purchase returns 400');
  assert(/no active reservation/i.test(p3.json.message), 'user 2 has no active reservation');

  // User 1 can still purchase their own reservation.
  const p3Owner = await purchase(drop3.id, 1);
  assert(p3Owner.status === 201, 'user 1 can still purchase their reservation');

  // --- Test 4: Expired reservation cannot be purchased ---
  console.log('\n4) Expired reservation cannot be purchased');
  const drop4 = await createDrop('Phase6 Expired', 3);
  const r4 = await reserve(drop4.id, 1);
  assert(r4.status === 201, 'reserve returns 201');
  await backdateExpiresAt(r4.json.data.reservationId);

  const p4 = await purchase(drop4.id, 1);
  assert(p4.status === 410, 'returns 410 Gone');
  assert(/expired/i.test(p4.json.message), 'message mentions expired');

  const purchaseCount4 = await Purchase.count({
    where: { reservationId: r4.json.data.reservationId },
  });
  assert(purchaseCount4 === 0, 'no purchase record created');

  const reservation4 = await Reservation.findByPk(r4.json.data.reservationId);
  assert(
    reservation4.status === 'active' || reservation4.status === 'expired',
    'status is active or expired (not completed)'
  );
  assert(reservation4.status !== 'completed', 'purchase did not complete an expired reservation');

  // --- Test 5: Purchase does not restore stock ---
  console.log('\n5) Purchase does not restore stock');
  const drop5 = await createDrop('Phase6 Stock', 10);
  const r5 = await reserve(drop5.id, 1);
  assert(r5.json.data.availableStock === 9, 'after reserve stock = 9');
  const p5 = await purchase(drop5.id, 1);
  assert(p5.status === 201, 'purchase succeeds');
  assert(p5.json.data.availableStock === 9, 'after purchase stock still = 9');
  const drop5After = await Drop.findByPk(drop5.id);
  assert(drop5After.availableStock === 9, 'DB stock still 9 (not 10)');

  // --- Test 6: Same reservation cannot be purchased twice ---
  console.log('\n6) Same reservation cannot be purchased twice');
  const drop6 = await createDrop('Phase6 Dup', 5);
  const r6 = await reserve(drop6.id, 1);
  const p6a = await purchase(drop6.id, 1);
  assert(p6a.status === 201, 'first purchase succeeds');
  const p6b = await purchase(drop6.id, 1);
  assert(p6b.status === 409, 'second purchase returns 409');
  assert(/already been purchased/i.test(p6b.json.message), 'message mentions already purchased');

  const purchaseCount6 = await Purchase.count({
    where: { dropId: drop6.id, userId: 1 },
  });
  assert(purchaseCount6 === 1, 'exactly one purchase record exists');

  // --- Test 7: Reservation and purchase are atomic ---
  console.log('\n7) Reservation and purchase are atomic (rollback)');
  const drop7 = await createDrop('Phase6 Atomic', 5);
  const r7 = await reserve(drop7.id, 1);
  assert(r7.status === 201, 'reserve for atomic test');
  const reservationId7 = r7.json.data.reservationId;

  let rolledBack = false;
  try {
    await sequelize.transaction(async (transaction) => {
      const reservation = await Reservation.findByPk(reservationId7, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      await Purchase.create(
        {
          dropId: drop7.id,
          userId: 1,
          reservationId: reservationId7,
          quantity: reservation.quantity,
          purchasedAt: new Date(),
        },
        { transaction }
      );

      reservation.status = 'completed';
      await reservation.save({ transaction });

      // Force failure after both writes — both must roll back together.
      throw new Error('forced rollback');
    });
  } catch (err) {
    if (err.message === 'forced rollback') {
      rolledBack = true;
    } else {
      throw err;
    }
  }

  assert(rolledBack, 'transaction threw as expected');
  const reservation7 = await Reservation.findByPk(reservationId7);
  assert(reservation7.status === 'active', 'reservation still active after rollback');
  const purchaseCount7 = await Purchase.count({ where: { reservationId: reservationId7 } });
  assert(purchaseCount7 === 0, 'no purchase left after rollback');

  // Clean up: complete via real API so this reservation does not linger.
  const p7 = await purchase(drop7.id, 1);
  assert(p7.status === 201, 'can still purchase after failed atomic attempt');

  // --- Test 8: Existing expiration worker still works ---
  console.log('\n8) Existing expiration worker still works');
  const drop8 = await createDrop('Phase6 Expiry Still Works', 1);
  const r8 = await reserve(drop8.id, 2);
  assert(r8.status === 201, 'reserve returns 201');
  assert(r8.json.data.availableStock === 0, 'stock is 0 after reserve');

  await backdateExpiresAt(r8.json.data.reservationId);
  await waitUntil('phase5 expiry still works', async () => {
    const row = await Reservation.findByPk(r8.json.data.reservationId);
    return row.status === 'expired';
  });

  const reservation8 = await Reservation.findByPk(r8.json.data.reservationId);
  const drop8After = await Drop.findByPk(drop8.id);
  assert(reservation8.status === 'expired', 'unpurchased reservation expired');
  assert(drop8After.availableStock === 1, 'stock restored by worker');

  // Extra error-path checks
  console.log('\n9) Error paths (header / user / drop)');
  const missing = await request('POST', `/api/drops/${drop1.id}/purchase`);
  assert(missing.status === 400, 'missing X-User-Id returns 400');
  assert(/X-User-Id header is required/i.test(missing.json.message), 'required header message');

  const badUser = await purchase(drop1.id, 999999);
  assert(badUser.status === 404, 'unknown user returns 404');

  const badDropId = await request('POST', '/api/drops/abc/purchase', {
    headers: { 'X-User-Id': '1' },
  });
  assert(badDropId.status === 400, 'invalid drop id returns 400');

  const missingDrop = await purchase(999999, 1);
  assert(missingDrop.status === 404, 'missing drop returns 404');

  console.log('\nAll Phase 6 tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
