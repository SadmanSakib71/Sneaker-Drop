/**
 * Phase 7 Socket.io real-time verification script.
 *
 * Run while the API is listening on PORT (default 5000):
 *   node scripts/phase7-socket-test.js
 */
require('dotenv').config();

const { io } = require('socket.io-client');
const { sequelize, Drop, Reservation } = require('../src/models');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20000;
const EVENT_WAIT_MS = 5000;

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

function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      transports: ['websocket'],
      forceNew: true,
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket connection timed out'));
    }, EVENT_WAIT_MS);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForStockUpdated(socket, expectedDropId, timeoutMs = EVENT_WAIT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('stock_updated', onEvent);
      reject(new Error(`timed out waiting for stock_updated (drop ${expectedDropId})`));
    }, timeoutMs);

    function onEvent(payload) {
      if (payload && payload.dropId === expectedDropId) {
        clearTimeout(timer);
        socket.off('stock_updated', onEvent);
        resolve(payload);
      }
    }

    socket.on('stock_updated', onEvent);
  });
}

function collectStockUpdated(socket, expectedDropId, durationMs = 2500) {
  const events = [];
  function onEvent(payload) {
    if (payload && payload.dropId === expectedDropId) {
      events.push(payload);
    }
  }
  socket.on('stock_updated', onEvent);
  return {
    events,
    stop() {
      socket.off('stock_updated', onEvent);
    },
    async wait(ms = durationMs) {
      await sleep(ms);
      this.stop();
      return events;
    },
  };
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
      description: 'phase7 socket test',
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
  console.log('Phase 7 Socket.io tests\n');

  const sockets = [];

  try {
    // --- Test 1: Socket connection ---
    console.log('1) Socket connection');
    const s1 = await connectSocket();
    sockets.push(s1);
    assert(s1.connected === true, 'client connects successfully');

    // --- Test 2: Join room (verified via receiving broadcast) ---
    console.log('\n2) Join drop room');
    const dropJoin = await createDrop('Phase7 Join', 10);
    s1.emit('join_drop', { dropId: dropJoin.id });
    await sleep(200);

    // Invalid join must not crash the server
    s1.emit('join_drop', { dropId: 'abc' });
    s1.emit('join_drop', { dropId: -1 });
    s1.emit('join_drop', null);
    await sleep(200);

    const health = await request('GET', '/api/health');
    assert(health.status === 200, 'server still healthy after invalid join payloads');

    const joinWait = waitForStockUpdated(s1, dropJoin.id);
    const rJoin = await reserve(dropJoin.id, 1);
    assert(rJoin.status === 201, 'reserve after join returns 201');
    const joinedEvent = await joinWait;
    assert(joinedEvent.availableStock === 9, 'joined client received stock_updated (9)');
    assert(joinedEvent.dropId === dropJoin.id, 'stock_updated dropId matches');

    // --- Test 3: Leave room ---
    console.log('\n3) Leave drop room');
    const dropLeave = await createDrop('Phase7 Leave', 10);
    const sLeave = await connectSocket();
    sockets.push(sLeave);
    const sStay = await connectSocket();
    sockets.push(sStay);

    sLeave.emit('join_drop', { dropId: dropLeave.id });
    sStay.emit('join_drop', { dropId: dropLeave.id });
    await sleep(200);

    sLeave.emit('leave_drop', { dropId: dropLeave.id });
    sLeave.emit('leave_drop', { dropId: 'abc' }); // invalid — ignore safely
    await sleep(200);

    const leftCollector = collectStockUpdated(sLeave, dropLeave.id, 3000);
    const stayWait = waitForStockUpdated(sStay, dropLeave.id);

    const rLeave = await reserve(dropLeave.id, 2);
    assert(rLeave.status === 201, 'reserve after leave returns 201');

    const stayEvent = await stayWait;
    assert(stayEvent.availableStock === 9, 'client still in room received stock_updated');

    const leftEvents = await leftCollector.wait();
    assert(leftEvents.length === 0, 'client that left did NOT receive stock_updated');

    // --- Test 4: Reservation broadcasts to all room members ---
    console.log('\n4) Reservation broadcasts stock_updated to room');
    const dropBroadcast = await createDrop('Phase7 Broadcast', 100);
    const a = await connectSocket();
    const b = await connectSocket();
    sockets.push(a, b);

    a.emit('join_drop', { dropId: dropBroadcast.id });
    b.emit('join_drop', { dropId: dropBroadcast.id });
    await sleep(200);

    const waitA = waitForStockUpdated(a, dropBroadcast.id);
    const waitB = waitForStockUpdated(b, dropBroadcast.id);

    const rBroadcast = await reserve(dropBroadcast.id, 1);
    assert(rBroadcast.status === 201, 'reserve returns 201');
    assert(rBroadcast.json.data.availableStock === 99, 'REST availableStock is 99');

    const eventA = await waitA;
    const eventB = await waitB;
    assert(eventA.availableStock === 99, 'client A received availableStock 99');
    assert(eventB.availableStock === 99, 'client B received availableStock 99');
    assert(eventA.dropId === dropBroadcast.id, 'client A dropId matches');
    assert(eventB.dropId === dropBroadcast.id, 'client B dropId matches');

    // --- Test 5: Failed reservation does NOT broadcast ---
    console.log('\n5) Failed reservation does NOT broadcast');
    const dropFail = await createDrop('Phase7 Fail Reserve', 1);
    const burn = await reserve(dropFail.id, 1);
    assert(burn.status === 201, 'burn last unit');
    assert(burn.json.data.availableStock === 0, 'stock is 0');

    const sFail = await connectSocket();
    sockets.push(sFail);
    sFail.emit('join_drop', { dropId: dropFail.id });
    await sleep(200);

    // Drain the burn event if it arrived after join (join was after burn, so none expected)
    const failCollector = collectStockUpdated(sFail, dropFail.id, 2500);
    const failRes = await reserve(dropFail.id, 2);
    assert(failRes.status === 409, 'insufficient stock returns 409');
    const failEvents = await failCollector.wait();
    assert(failEvents.length === 0, 'no stock_updated on failed reservation');

    const dropFailAfter = await Drop.findByPk(dropFail.id);
    assert(dropFailAfter.availableStock === 0, 'DB stock still 0');

    // --- Test 6: Expiration broadcasts stock recovery ---
    console.log('\n6) Expiration broadcasts stock recovery');
    const dropExpire = await createDrop('Phase7 Expire', 100);
    const sExp1 = await connectSocket();
    const sExp2 = await connectSocket();
    sockets.push(sExp1, sExp2);
    sExp1.emit('join_drop', { dropId: dropExpire.id });
    sExp2.emit('join_drop', { dropId: dropExpire.id });
    await sleep(200);

    const rExp = await reserve(dropExpire.id, 1);
    assert(rExp.status === 201, 'reserve before expire');
    assert(rExp.json.data.availableStock === 99, 'stock is 99 after reserve');

    // Wait briefly for reserve events to settle, then listen for restore.
    await sleep(300);
    const expWait1 = waitForStockUpdated(sExp1, dropExpire.id, POLL_TIMEOUT_MS);
    const expWait2 = waitForStockUpdated(sExp2, dropExpire.id, POLL_TIMEOUT_MS);

    await backdateExpiresAt(rExp.json.data.reservationId);

    await waitUntil('reservation expired', async () => {
      const row = await Reservation.findByPk(rExp.json.data.reservationId);
      return row.status === 'expired';
    });

    const restored1 = await expWait1;
    const restored2 = await expWait2;
    assert(restored1.availableStock === 100, 'client 1 got restored stock 100');
    assert(restored2.availableStock === 100, 'client 2 got restored stock 100');

    const dropExpireAfter = await Drop.findByPk(dropExpire.id);
    assert(dropExpireAfter.availableStock === 100, 'DB stock restored to 100');

    // --- Test 7: Purchase does not decrement stock again ---
    console.log('\n7) Purchase does not decrement stock again');
    const dropPurchase = await createDrop('Phase7 Purchase', 10);
    const sPurchase = await connectSocket();
    sockets.push(sPurchase);
    sPurchase.emit('join_drop', { dropId: dropPurchase.id });
    await sleep(200);

    const rPurchase = await reserve(dropPurchase.id, 1);
    assert(rPurchase.status === 201, 'reserve returns 201');
    assert(rPurchase.json.data.availableStock === 9, 'after reserve stock = 9');

    await sleep(300);
    const purchaseWait = waitForStockUpdated(sPurchase, dropPurchase.id);
    const pPurchase = await purchase(dropPurchase.id, 1);
    assert(pPurchase.status === 201, 'purchase returns 201');
    assert(pPurchase.json.data.availableStock === 9, 'REST availableStock still 9');

    const purchaseEvent = await purchaseWait;
    assert(purchaseEvent.availableStock === 9, 'socket stock_updated still 9 (not 8)');

    const dropPurchaseAfter = await Drop.findByPk(dropPurchase.id);
    assert(dropPurchaseAfter.availableStock === 9, 'DB availableStock still 9');

    // --- Test 8: Transaction failure does NOT broadcast ---
    console.log('\n8) Transaction failure does NOT broadcast');
    const dropAtomic = await createDrop('Phase7 Atomic', 5);
    const sAtomic = await connectSocket();
    sockets.push(sAtomic);
    sAtomic.emit('join_drop', { dropId: dropAtomic.id });
    await sleep(200);

    const beforeStock = (await Drop.findByPk(dropAtomic.id)).availableStock;
    const atomicCollector = collectStockUpdated(sAtomic, dropAtomic.id, 2500);

    let rolledBack = false;
    try {
      await sequelize.transaction(async (transaction) => {
        const drop = await Drop.findByPk(dropAtomic.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        drop.availableStock -= 1;
        await drop.save({ transaction });
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
    const afterStock = (await Drop.findByPk(dropAtomic.id)).availableStock;
    assert(afterStock === beforeStock, 'DB stock unchanged after rollback');

    const atomicEvents = await atomicCollector.wait();
    assert(atomicEvents.length === 0, 'no stock_updated emitted on rolled-back transaction');

    // Failed REST path also must not emit
    const badUserCollector = collectStockUpdated(sAtomic, dropAtomic.id, 2000);
    const badUser = await reserve(dropAtomic.id, 999999);
    assert(badUser.status === 404, 'unknown user returns 404');
    const badUserEvents = await badUserCollector.wait();
    assert(badUserEvents.length === 0, 'no stock_updated on 404 reserve failure');

    console.log('\nAll Phase 7 tests passed.');
  } finally {
    for (const s of sockets) {
      try {
        s.close();
      } catch {
        // ignore
      }
    }
    await sequelize.close();
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
