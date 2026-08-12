/**
 * Temporary Phase 4 verification script.
 * Run while the API is listening on PORT (default 5000).
 *
 * Usage: node scripts/phase4-reserve-test.js
 */
require('dotenv').config();

const BASE = `http://localhost:${process.env.PORT || 5000}`;

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

async function main() {
  console.log('Phase 4 reservation tests\n');

  // --- Setup: create drops used by tests ---
  const stockDrop = await request('POST', '/api/drops', {
    body: {
      name: 'Phase4 Stock Drop',
      description: 'for reserve tests',
      price: 120,
      totalStock: 5,
      startsAt: new Date().toISOString(),
    },
  });
  assert(stockDrop.status === 201, 'setup: create stock drop');
  const dropId = stockDrop.json.data.id;

  const zeroDrop = await request('POST', '/api/drops', {
    body: {
      name: 'Phase4 Zero Stock',
      price: 99,
      totalStock: 1,
      startsAt: new Date().toISOString(),
    },
  });
  assert(zeroDrop.status === 201, 'setup: create zero-stock drop');
  const zeroDropId = zeroDrop.json.data.id;

  // Burn the only unit so availableStock = 0
  const burn = await request('POST', `/api/drops/${zeroDropId}/reserve`, {
    headers: { 'X-User-Id': '1' },
  });
  assert(burn.status === 201, 'setup: burn last unit of zero-stock drop');

  const raceDrop = await request('POST', '/api/drops', {
    body: {
      name: 'Phase4 Race Drop',
      price: 200,
      totalStock: 1,
      startsAt: new Date().toISOString(),
    },
  });
  assert(raceDrop.status === 201, 'setup: create race drop (stock=1)');
  const raceDropId = raceDrop.json.data.id;

  console.log('\n1) Successful reservation');
  const ok = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '1' },
    body: { quantity: 1 },
  });
  assert(ok.status === 201, 'returns 201');
  assert(ok.json.data.status === 'active', 'status is active');
  assert(ok.json.data.quantity === 1, 'quantity is 1');
  assert(ok.json.data.userId === 1, 'userId is 1');
  assert(ok.json.data.dropId === dropId, 'dropId matches');
  assert(typeof ok.json.data.reservationId === 'number', 'has reservationId');

  console.log('\n2) Missing X-User-Id');
  const missing = await request('POST', `/api/drops/${dropId}/reserve`);
  assert(missing.status === 400, 'returns 400');

  console.log('\n3) Invalid / non-existing user');
  const badUser = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '999999' },
  });
  assert(badUser.status === 404, 'non-existing user returns 404');

  console.log('\n4) Invalid drop ID');
  const badDropId = await request('POST', '/api/drops/abc/reserve', {
    headers: { 'X-User-Id': '2' },
  });
  assert(badDropId.status === 400, 'invalid drop id returns 400');

  console.log('\n5) Non-existing drop');
  const missingDrop = await request('POST', '/api/drops/999999/reserve', {
    headers: { 'X-User-Id': '2' },
  });
  assert(missingDrop.status === 404, 'non-existing drop returns 404');

  console.log('\n6) Invalid quantity');
  const badQty = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '2' },
    body: { quantity: 0 },
  });
  assert(badQty.status === 400, 'quantity 0 returns 400');
  const negQty = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '2' },
    body: { quantity: -1 },
  });
  assert(negQty.status === 400, 'negative quantity returns 400');
  const floatQty = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '2' },
    body: { quantity: 1.5 },
  });
  assert(floatQty.status === 400, 'non-integer quantity returns 400');

  console.log('\n7) Successful reservation decreases availableStock');
  assert(ok.json.data.availableStock === 4, 'stock decreased 5 → 4 after first reserve');
  const getDrop = await request('GET', `/api/drops/${dropId}`);
  assert(getDrop.json.data.availableStock === 4, 'GET drop also shows availableStock=4');

  console.log('\n8) User cannot create a second active reservation');
  const dup = await request('POST', `/api/drops/${dropId}/reserve`, {
    headers: { 'X-User-Id': '1' },
  });
  assert(dup.status === 409, 'duplicate active reservation returns 409');
  assert(
    /already have an active reservation/i.test(dup.json.message),
    'message mentions active reservation'
  );

  console.log('\n9) expiresAt ~60 seconds in the future');
  const expiresAt = new Date(ok.json.data.expiresAt).getTime();
  const now = Date.now();
  const deltaSec = (expiresAt - now) / 1000;
  assert(deltaSec > 50 && deltaSec < 70, `expiresAt ~60s ahead (got ${deltaSec.toFixed(1)}s)`);

  console.log('\n10) Reservation when stock is 0 returns 409');
  const zero = await request('POST', `/api/drops/${zeroDropId}/reserve`, {
    headers: { 'X-User-Id': '2' },
  });
  assert(zero.status === 409, 'zero stock returns 409');
  assert(/not enough stock/i.test(zero.json.message), 'message mentions stock');

  console.log('\n11) CONCURRENCY: 20 users race for 1 unit');
  const userIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const results = await Promise.all(
    userIds.map((uid) =>
      request('POST', `/api/drops/${raceDropId}/reserve`, {
        headers: { 'X-User-Id': String(uid) },
      })
    )
  );

  const successes = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(`  successes=${successes.length}, conflicts=${conflicts.length}, other=${other.length}`);
  if (other.length) {
    console.log('  unexpected:', other.map((r) => ({ status: r.status, message: r.json.message })));
  }

  assert(successes.length === 1, 'exactly ONE reservation succeeds');
  assert(conflicts.length === 19, 'remaining 19 requests get 409');

  const afterRace = await request('GET', `/api/drops/${raceDropId}`);
  assert(afterRace.json.data.availableStock === 0, 'availableStock is 0 (never negative)');
  assert(afterRace.json.data.availableStock >= 0, 'availableStock is non-negative');

  console.log('\nAll Phase 4 tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
