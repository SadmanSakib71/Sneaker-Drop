/**
 * Temporary Phase 5 verification script.
 *
 * Real reservation TTL stays 60s. To keep this script fast, we simulate
 * elapsed time by setting expiresAt into the past, then wait for the
 * background worker (~1.5s interval) to expire the reservation.
 *
 * Run while the API is listening on PORT (default 5000):
 *   node scripts/phase5-expiry-test.js
 */
require('dotenv').config();

const { Drop, Reservation } = require('../src/models');

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

/** Wait until the background worker has applied the expected state. */
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
      description: 'phase5 expiry test',
      price: 150,
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

/** Simulate time passing without changing the real 60s TTL. */
async function backdateExpiresAt(reservationId) {
  const reservation = await Reservation.findByPk(reservationId);
  reservation.expiresAt = new Date(Date.now() - 1000);
  await reservation.save();
}

async function main() {
  console.log('Phase 5 reservation expiry tests\n');
  console.log('(TTL remains 60s; expiresAt is backdated so the worker can act quickly)\n');

  // --- Test 1: Basic expiration ---
  console.log('1) Basic expiration');
  const drop1 = await createDrop('Phase5 Basic', 1);
  const r1 = await reserve(drop1.id, 1);
  assert(r1.status === 201, 'reserve returns 201');
  assert(r1.json.data.status === 'active', 'status is active');
  assert(r1.json.data.availableStock === 0, 'availableStock is 0 after reserve');

  await backdateExpiresAt(r1.json.data.reservationId);
  await waitUntil('basic expiry', async () => {
    const row = await Reservation.findByPk(r1.json.data.reservationId);
    return row.status === 'expired';
  });

  const reservation1 = await Reservation.findByPk(r1.json.data.reservationId);
  const drop1After = await Drop.findByPk(drop1.id);
  assert(reservation1.status === 'expired', 'status became expired');
  assert(drop1After.availableStock === 1, 'availableStock restored to 1');

  // --- Test 2: Multiple reservations ---
  console.log('\n2) Multiple reservations expire and restore stock');
  const drop2 = await createDrop('Phase5 Multi', 5);
  const multi = await Promise.all([
    reserve(drop2.id, 1),
    reserve(drop2.id, 2),
    reserve(drop2.id, 3),
  ]);
  assert(multi.every((r) => r.status === 201), 'three reservations succeed');

  const drop2Mid = await Drop.findByPk(drop2.id);
  assert(drop2Mid.availableStock === 2, 'availableStock is 2 after three reserves');

  const multiIds = multi.map((r) => r.json.data.reservationId);
  await Promise.all(multiIds.map(backdateExpiresAt));
  await waitUntil('multi expiry', async () => {
    const rows = await Reservation.findAll({ where: { id: multiIds } });
    return rows.length === 3 && rows.every((r) => r.status === 'expired');
  });

  const multiRows = await Reservation.findAll({ where: { id: multiIds } });
  assert(
    multiRows.every((r) => r.status === 'expired'),
    'all three reservations expired'
  );
  const drop2After = await Drop.findByPk(drop2.id);
  assert(drop2After.availableStock === 5, 'availableStock restored to 5');

  // --- Test 3: Completed reservation must NOT restore stock ---
  console.log('\n3) Completed reservation is not expired / stock unchanged');
  const drop3 = await createDrop('Phase5 Completed', 1);
  const r3 = await reserve(drop3.id, 1);
  assert(r3.status === 201, 'reserve returns 201');

  const completed = await Reservation.findByPk(r3.json.data.reservationId);
  completed.status = 'completed';
  await completed.save();

  const stockBefore = (await Drop.findByPk(drop3.id)).availableStock;
  assert(stockBefore === 0, 'stock still 0 after marking completed');

  await backdateExpiresAt(r3.json.data.reservationId);
  // Worker should skip completed rows — wait long enough for at least one pass.
  await sleep(4000);

  const completedAfter = await Reservation.findByPk(r3.json.data.reservationId);
  const drop3After = await Drop.findByPk(drop3.id);
  assert(completedAfter.status === 'completed', 'status remains completed');
  assert(drop3After.availableStock === 0, 'availableStock unchanged (no restore)');

  // --- Test 4: Already expired — no double restore ---
  console.log('\n4) Already expired reservation does not restore stock twice');
  const drop4 = await createDrop('Phase5 Double', 1);
  const r4 = await reserve(drop4.id, 1);
  assert(r4.status === 201, 'reserve returns 201');

  await backdateExpiresAt(r4.json.data.reservationId);
  await waitUntil('first expiry', async () => {
    const row = await Reservation.findByPk(r4.json.data.reservationId);
    return row.status === 'expired';
  });

  const afterFirst = await Drop.findByPk(drop4.id);
  assert(afterFirst.availableStock === 1, 'stock restored once to 1');
  assert(
    (await Reservation.findByPk(r4.json.data.reservationId)).status === 'expired',
    'status is expired'
  );

  // Another worker pass must not add stock again.
  await sleep(4000);

  const afterSecond = await Drop.findByPk(drop4.id);
  assert(afterSecond.availableStock === 1, 'stock still 1 (no double restore)');

  // --- Test 5: Phase 4 reservation still works ---
  console.log('\n5) Existing Phase 4 reserve path still works');
  const drop5 = await createDrop('Phase5 Still Works', 2);
  const r5 = await reserve(drop5.id, 1);
  assert(r5.status === 201, 'reserve still returns 201');
  assert(r5.json.data.status === 'active', 'new reservation is active');
  assert(r5.json.data.availableStock === 1, 'stock decreased correctly');
  const ttlSec =
    (new Date(r5.json.data.expiresAt).getTime() - Date.now()) / 1000;
  assert(ttlSec > 50 && ttlSec < 70, `real TTL still ~60s (got ${ttlSec.toFixed(1)}s)`);

  console.log('\nAll Phase 5 tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
