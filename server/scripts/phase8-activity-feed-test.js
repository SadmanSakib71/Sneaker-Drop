/**
 * Phase 8 Drop Activity Feed verification script.
 *
 * Run while the API is listening on PORT (default 5000):
 *   node scripts/phase8-activity-feed-test.js
 */
require('dotenv').config();

const { io } = require('socket.io-client');
const { sequelize, User, Drop } = require('../src/models');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
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

function waitForPurchaseFeed(socket, expectedDropId, timeoutMs = EVENT_WAIT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('purchase_feed_updated', onEvent);
      reject(new Error(`timed out waiting for purchase_feed_updated (drop ${expectedDropId})`));
    }, timeoutMs);

    function onEvent(payload) {
      if (payload && payload.dropId === expectedDropId) {
        clearTimeout(timer);
        socket.off('purchase_feed_updated', onEvent);
        resolve(payload);
      }
    }

    socket.on('purchase_feed_updated', onEvent);
  });
}

function collectPurchaseFeed(socket, expectedDropId, durationMs = 2500) {
  const events = [];
  function onEvent(payload) {
    if (payload && payload.dropId === expectedDropId) {
      events.push(payload);
    }
  }
  socket.on('purchase_feed_updated', onEvent);
  return {
    events,
    stop() {
      socket.off('purchase_feed_updated', onEvent);
    },
    async wait(ms = durationMs) {
      await sleep(ms);
      this.stop();
      return events;
    },
  };
}

async function ensureUsers(count) {
  const users = [];
  for (let i = 1; i <= count; i += 1) {
    let user = await User.findByPk(i);
    if (!user) {
      user = await User.create({ id: i, name: `User${i}` });
    }
    users.push(user);
  }
  return users;
}

async function createDrop(name, totalStock) {
  const res = await request('POST', '/api/drops', {
    body: {
      name,
      description: 'phase8 activity feed test',
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

async function reserveAndPurchase(dropId, userId) {
  const r = await reserve(dropId, userId);
  assert(r.status === 201, `user ${userId} reserves drop ${dropId}`);
  // Tiny gap so purchasedAt ordering is deterministic.
  await sleep(25);
  const p = await purchase(dropId, userId);
  assert(p.status === 201, `user ${userId} purchases drop ${dropId}`);
  return p.json.data;
}

function assertPurchaserShape(purchaser, label) {
  assert(typeof purchaser.userId === 'number', `${label} has userId`);
  assert(typeof purchaser.username === 'string' && purchaser.username.length > 0, `${label} has username`);
  assert(purchaser.purchasedAt != null, `${label} has purchasedAt`);
  assert(purchaser.password === undefined, `${label} does not expose password`);
  assert(purchaser.email === undefined, `${label} does not expose email`);
}

async function main() {
  console.log('Phase 8 Activity Feed tests\n');

  const sockets = [];

  try {
    await ensureUsers(5);

    // --- Test 1: Drop with no purchases ---
    console.log('1) Drop with no purchases');
    const emptyDrop = await createDrop('Phase8 Empty', 10);
    const listEmpty = await request('GET', '/api/drops');
    assert(listEmpty.status === 200, 'GET /api/drops returns 200');
    const emptyFromList = listEmpty.json.data.find((d) => d.id === emptyDrop.id);
    assert(!!emptyFromList, 'new drop appears in list');
    assert(Array.isArray(emptyFromList.latestPurchasers), 'latestPurchasers is an array');
    assert(emptyFromList.latestPurchasers.length === 0, 'latestPurchasers is []');

    // --- Test 2: One purchase ---
    console.log('\n2) One purchase');
    const dropOne = await createDrop('Phase8 One', 10);
    await reserveAndPurchase(dropOne.id, 1);
    const oneDetail = await request('GET', `/api/drops/${dropOne.id}`);
    assert(oneDetail.status === 200, 'GET /api/drops/:id returns 200');
    assert(oneDetail.json.data.latestPurchasers.length === 1, 'exactly 1 purchaser');
    assert(oneDetail.json.data.latestPurchasers[0].userId === 1, 'purchaser is user 1');
    assertPurchaserShape(oneDetail.json.data.latestPurchasers[0], 'single purchaser');

    // --- Test 3: Three purchases, newest first ---
    console.log('\n3) Three purchases newest-first');
    const dropThree = await createDrop('Phase8 Three', 10);
    await reserveAndPurchase(dropThree.id, 1);
    await reserveAndPurchase(dropThree.id, 2);
    await reserveAndPurchase(dropThree.id, 3);
    const threeDetail = await request('GET', `/api/drops/${dropThree.id}`);
    const three = threeDetail.json.data.latestPurchasers;
    assert(three.length === 3, 'exactly 3 purchasers');
    assert(three[0].userId === 3, 'newest is user 3');
    assert(three[1].userId === 2, 'middle is user 2');
    assert(three[2].userId === 1, 'oldest is user 1');
    assert(
      new Date(three[0].purchasedAt) >= new Date(three[1].purchasedAt) &&
        new Date(three[1].purchasedAt) >= new Date(three[2].purchasedAt),
      'purchasedAt is descending'
    );

    // --- Test 4: More than three → only latest 3 ---
    console.log('\n4) More than three purchases → only latest 3');
    const dropFour = await createDrop('Phase8 Four', 10);
    await reserveAndPurchase(dropFour.id, 1);
    await reserveAndPurchase(dropFour.id, 2);
    await reserveAndPurchase(dropFour.id, 3);
    await reserveAndPurchase(dropFour.id, 4);
    const fourDetail = await request('GET', `/api/drops/${dropFour.id}`);
    const four = fourDetail.json.data.latestPurchasers;
    assert(four.length === 3, 'only 3 purchasers returned');
    assert(four[0].userId === 4, 'newest is user 4');
    assert(four[1].userId === 3, 'second is user 3');
    assert(four[2].userId === 2, 'third is user 2');
    assert(!four.some((p) => p.userId === 1), 'oldest user 1 is excluded');

    // --- Test 5: Purchasers scoped per drop ---
    console.log('\n5) Purchasers scoped per drop');
    const dropA = await createDrop('Phase8 Scope A', 10);
    const dropB = await createDrop('Phase8 Scope B', 10);
    await reserveAndPurchase(dropA.id, 1);
    await reserveAndPurchase(dropA.id, 2);
    await reserveAndPurchase(dropB.id, 3);
    await reserveAndPurchase(dropB.id, 4);

    const detailA = await request('GET', `/api/drops/${dropA.id}`);
    const detailB = await request('GET', `/api/drops/${dropB.id}`);
    const idsA = detailA.json.data.latestPurchasers.map((p) => p.userId).sort();
    const idsB = detailB.json.data.latestPurchasers.map((p) => p.userId).sort();
    assert(JSON.stringify(idsA) === JSON.stringify([1, 2]), 'drop A only has users 1 and 2');
    assert(JSON.stringify(idsB) === JSON.stringify([3, 4]), 'drop B only has users 3 and 4');

    // --- Test 6: User information shape ---
    console.log('\n6) User information');
    const user = await User.findByPk(4);
    const purchaser = four[0];
    assert(purchaser.userId === 4, 'userId matches');
    assert(purchaser.username === user.name, 'username comes from User.name');
    assertPurchaserShape(purchaser, 'feed purchaser');

    // --- Test 7: GET /api/drops includes latestPurchasers on every drop ---
    console.log('\n7) GET /api/drops includes latestPurchasers');
    const allDrops = await request('GET', '/api/drops');
    assert(allDrops.status === 200, 'list returns 200');
    assert(allDrops.json.data.length > 0, 'list is non-empty');
    for (const drop of allDrops.json.data) {
      assert(Array.isArray(drop.latestPurchasers), `drop ${drop.id} has latestPurchasers array`);
    }

    // --- Test 8: GET /api/drops/:id includes latestPurchasers ---
    console.log('\n8) GET /api/drops/:id includes latestPurchasers');
    const byId = await request('GET', `/api/drops/${dropFour.id}`);
    assert(byId.status === 200, 'detail returns 200');
    assert(Array.isArray(byId.json.data.latestPurchasers), 'detail has latestPurchasers');
    assert(byId.json.data.latestPurchasers.length === 3, 'detail returns top 3');

    // --- Test 9: purchase_feed_updated Socket.io event ---
    console.log('\n9) purchase_feed_updated to room members');
    const dropSocket = await createDrop('Phase8 Socket Feed', 10);
    const s1 = await connectSocket();
    const s2 = await connectSocket();
    sockets.push(s1, s2);
    s1.emit('join_drop', { dropId: dropSocket.id });
    s2.emit('join_drop', { dropId: dropSocket.id });
    await sleep(200);

    const wait1 = waitForPurchaseFeed(s1, dropSocket.id);
    const wait2 = waitForPurchaseFeed(s2, dropSocket.id);

    await reserveAndPurchase(dropSocket.id, 1);

    const feed1 = await wait1;
    const feed2 = await wait2;
    assert(feed1.dropId === dropSocket.id, 'client 1 dropId matches');
    assert(feed2.dropId === dropSocket.id, 'client 2 dropId matches');
    assert(Array.isArray(feed1.purchasers), 'client 1 got purchasers array');
    assert(Array.isArray(feed2.purchasers), 'client 2 got purchasers array');
    assert(feed1.purchasers.length === 1, 'client 1 sees 1 purchaser');
    assert(feed2.purchasers.length === 1, 'client 2 sees 1 purchaser');
    assert(feed1.purchasers[0].userId === 1, 'client 1 purchaser is user 1');
    assertPurchaserShape(feed1.purchasers[0], 'socket purchaser');

    // --- Test 10: Failed purchase does NOT broadcast ---
    console.log('\n10) Failed purchase does NOT broadcast');
    const dropFail = await createDrop('Phase8 Fail Feed', 5);
    const sFail = await connectSocket();
    sockets.push(sFail);
    sFail.emit('join_drop', { dropId: dropFail.id });
    await sleep(200);

    const failCollector = collectPurchaseFeed(sFail, dropFail.id, 2500);
    const failPurchase = await purchase(dropFail.id, 1);
    assert(failPurchase.status === 400, 'purchase without reservation fails');
    const failEvents = await failCollector.wait();
    assert(failEvents.length === 0, 'no purchase_feed_updated on failed purchase');

    const failDetail = await request('GET', `/api/drops/${dropFail.id}`);
    assert(failDetail.json.data.latestPurchasers.length === 0, 'no fake purchaser in feed');

    // stock_updated still works on successful reserve (Phase 7 regression check)
    console.log('\n11) stock_updated still works');
    const dropStock = await createDrop('Phase8 Stock Still', 10);
    const sStock = await connectSocket();
    sockets.push(sStock);
    sStock.emit('join_drop', { dropId: dropStock.id });
    await sleep(200);

    const stockEvent = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sStock.off('stock_updated', onEvent);
        reject(new Error('timed out waiting for stock_updated'));
      }, EVENT_WAIT_MS);

      function onEvent(payload) {
        if (payload && payload.dropId === dropStock.id) {
          clearTimeout(timer);
          sStock.off('stock_updated', onEvent);
          resolve(payload);
        }
      }

      sStock.on('stock_updated', onEvent);
      reserve(dropStock.id, 1).then((r) => {
        if (r.status !== 201) {
          clearTimeout(timer);
          sStock.off('stock_updated', onEvent);
          reject(new Error(`reserve failed: ${r.status}`));
        }
      });
    });
    assert(stockEvent.availableStock === 9, 'stock_updated still broadcasts after Phase 8');

    console.log('\nAll Phase 8 tests passed.');
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
