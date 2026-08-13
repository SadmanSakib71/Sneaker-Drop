# SneakerDrop

SneakerDrop is a real-time inventory system for a limited-edition sneaker drop. Users reserve stock for 60 seconds, then complete a purchase. PostgreSQL is the source of truth for inventory; Socket.io broadcasts committed stock and purchase-feed updates to connected clients.

## Live Demo

- **Frontend:** [https://sneaker-drop-six.vercel.app/](https://sneaker-drop-six.vercel.app/)
- **API:** [https://api-sneaker-drop.onrender.com](https://api-sneaker-drop.onrender.com)
- **Health:** [https://api-sneaker-drop.onrender.com/api/health](https://api-sneaker-drop.onrender.com/api/health)

## Features

- Drop listing and drop creation via REST
- Atomic stock reservation with PostgreSQL transactions and `SELECT … FOR UPDATE`
- 60-second server-controlled reservations
- Background worker that expires reservations and restores stock
- Transaction-safe purchase completion
- Socket.io rooms per drop for live stock and activity-feed updates
- Latest 3 purchasers per drop
- React dashboard with loading, error, and toast feedback
- Multi-browser / multi-tab stock and feed synchronization

## Tech Stack

**Frontend**

- React 19
- Vite
- Socket.io Client

**Backend**

- Node.js
- Express
- Sequelize
- Socket.io

**Database**

- PostgreSQL (Neon)

**Real-time**

- Socket.io attached to the existing HTTP server

## Architecture

```
React
  ↓
REST API / Socket.io
  ↓
Express
  ↓
Sequelize
  ↓
Neon PostgreSQL
```

PostgreSQL is the source of truth. REST endpoints perform all mutations inside database transactions. Socket.io does not calculate or modify stock; it only broadcasts values after a transaction commits.

Identity for reserve and purchase is the `X-User-Id` header. There is no JWT or session authentication in this project.

## Project Structure

```
SneakerDrop/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── api/            # REST client (drops, reserve, purchase)
│   │   ├── components/     # Drop cards, stock, timer, feed, toasts
│   │   ├── hooks/          # Socket.io connection, reservation countdown
│   │   └── pages/          # Drop list dashboard
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── scripts/            # Phase verification scripts
│   ├── src/
│   │   ├── config/         # Sequelize / Neon connection
│   │   ├── controllers/    # HTTP handlers
│   │   ├── jobs/           # Reservation expiry interval worker
│   │   ├── migrations/     # Sequelize migrations
│   │   ├── models/         # users, drops, reservations, purchases
│   │   ├── routes/         # /api/drops routes
│   │   ├── services/       # Reservation, purchase, expiry, feed
│   │   └── sockets/        # Socket.io rooms and emitters
│   ├── package.json
│   └── .sequelizerc
├── .gitignore
└── README.md
```

- `client/` — Vite React app that lists drops, reserves, purchases, and listens for live updates.
- `server/` — Express API, Sequelize models/migrations, Socket.io, and the expiry worker.

## Database Design

Four tables:

| Table          | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `users`        | Demo identities (`id`, `name`) referenced by `X-User-Id`   |
| `drops`        | Product, price, `totalStock`, `availableStock`, `startsAt` |
| `reservations` | Held stock for a user/drop until expiry or purchase        |
| `purchases`    | Completed buys, one per reservation                        |

**Relationships**

- A user has many reservations and many purchases.
- A drop has many reservations and many purchases.
- A reservation belongs to one user and one drop, and may have one purchase.
- A purchase belongs to one user, one drop, and one reservation (`reservationId` is unique).

**Constraints used by the reservation flow**

- `availableStock >= 0`, `totalStock >= 0`, and `availableStock <= totalStock`
- One **active** reservation per user per drop (partial unique index)
- Reservation quantity must be greater than 0

There is no public users REST API. Reserve and purchase return `404` if the `X-User-Id` does not match an existing `users` row.

## Stock Management

| Field            | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `totalStock`     | Original inventory for the drop. Set at create time. Not reduced by reserve or purchase. |
| `availableStock` | Units currently free to reserve.                                                         |
| Held stock       | Units on **active** reservations. Already subtracted from `availableStock`.              |
| Sold stock       | Units on completed purchases. Already subtracted at reservation time.                    |

On create, the server sets `availableStock` from `totalStock`. Clients cannot supply inventory.

**Reserve**

`availableStock` decreases by the reserved quantity (default `1`).

**Purchase**

`availableStock` does **not** decrease again. The unit was already removed during reservation.

**Expiration**

If an active reservation expires without purchase, `availableStock` increases by that reservation’s quantity.

## Atomic Reservation / Concurrency

Reservation runs in a single Sequelize transaction:

1. Load the user.
2. Lock the drop row with `SELECT … FOR UPDATE` (`transaction.LOCK.UPDATE`).
3. Reject the request if `availableStock` is insufficient (`409`).
4. Reject a second **active** reservation for the same user and drop (`409`).
5. Set `expiresAt` on the server (`now + 60 seconds`).
6. Decrement `availableStock` and insert the reservation.
7. After **COMMIT**, emit `stock_updated`.

If many clients try to reserve the last unit at the same time, PostgreSQL row locking serializes the drop-row updates. Only one transaction can hold the lock, see remaining stock, and succeed. The others see `availableStock < quantity` and receive `409 Not enough stock available`. Stock cannot go negative (`availableStock` has a database check constraint).

A verification script races 20 concurrent reserve requests against a drop with `totalStock: 1` and expects exactly one `201` and nineteen `409` responses.

## Reservation Expiration

- Reservations last **60 seconds**.
- The server sets `expiresAt`. The client countdown is display-only.
- `server/src/jobs/reservationExpiryJob.js` starts after a successful database connection.
- The worker calls `expireDueReservations()` every **1500ms** (`setInterval`). Overlapping ticks are skipped. There is no Redis or message queue.
- Due rows are found first (`status = active` and `expiresAt <= now`). Each row is expired in its own transaction with `FOR UPDATE` on the reservation and the drop.
- Only **active** reservations past `expiresAt` restore stock. Completed purchases are never expired and never restore stock.
- After a successful expiry COMMIT, the worker emits `stock_updated` with the restored `availableStock`.

## Purchase Flow

```
Reserve
  ↓
Active reservation
  ↓
Purchase
  ↓
Reservation completed
  ↓
Purchase created
```

Purchase and reservation completion run in **one transaction**:

1. Lock the user’s **active** reservation for that drop (`FOR UPDATE`).
2. Reject missing, already-purchased, or expired reservations.
3. Re-check `expiresAt` after the lock (the expiry worker may have raced).
4. Lock the drop row. Do **not** change `availableStock`.
5. Insert the purchase and set reservation `status` to `completed`.
6. After **COMMIT**, emit `stock_updated` (same stock value) and `purchase_feed_updated`.

Expired reservations cannot be purchased (`410`). Duplicate purchase of the same reservation returns `409`.

## Real-Time Socket.io

Socket.io is attached to the same HTTP server that serves Express (`http.createServer(app)` then `initSocket(httpServer)`).

**Rooms**

- Room name: `drop:<id>` (for example `drop:1`)
- Client events: `join_drop`, `leave_drop` with `{ dropId }`

**Server events (after COMMIT only)**

| Event                   | When                                    | Payload                      |
| ----------------------- | --------------------------------------- | ---------------------------- |
| `stock_updated`         | Successful reserve, purchase, or expiry | `{ dropId, availableStock }` |
| `purchase_feed_updated` | Successful purchase                     | `{ dropId, purchasers }`     |

Failed or rolled-back transactions do not emit. Socket.io never writes stock.

The React app keeps one shared Socket.io connection, joins each visible drop’s room, and updates local stock and feed from these events.

## Activity Feed

Each drop response includes `latestPurchasers`:

- Scoped to that drop only
- Ordered by `purchasedAt DESC`
- Limited to **3** records
- Each item: `{ userId, username, purchasedAt }` (`username` is `users.name`)

`GET /api/drops` and `GET /api/drops/:id` both include this array. After a successful purchase, `purchase_feed_updated` sends the same top-3 list to the drop room.

## API Endpoints

Base URL locally: `http://localhost:5000`

### Health

| Method | Path          | Purpose        |
| ------ | ------------- | -------------- |
| `GET`  | `/api/health` | Liveness check |

Response: `{ status, message, timestamp }`.

### Drops

**`POST /api/drops`** — Create a drop.

Body:

```json
{
  "name": "Air Max Drop",
  "description": "Optional description",
  "price": 180,
  "totalStock": 10,
  "startsAt": "2026-08-13T12:00:00.000Z"
}
```

`availableStock` is ignored if sent; the server copies `totalStock`. Returns `201` with the drop (`latestPurchasers` is `[]`).

**`GET /api/drops`** — List drops ordered by `startsAt` ascending. Each item includes `latestPurchasers`.

**`GET /api/drops/:id`** — Single drop plus `latestPurchasers`. `400` for an invalid id, `404` if missing.

### Reserve

**`POST /api/drops/:id/reserve`** — Create an active reservation.

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Header | `X-User-Id` (required, positive integer matching `users.id`) |
| Body   | `{ "quantity": 1 }` optional; defaults to `1`                |

Success `201`:

```json
{
  "status": "success",
  "data": {
    "reservationId": 1,
    "dropId": 1,
    "userId": 1,
    "quantity": 1,
    "status": "active",
    "expiresAt": "2026-08-13T12:01:00.000Z",
    "availableStock": 9
  }
}
```

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | Missing/invalid `X-User-Id`, invalid drop id, invalid quantity            |
| `404`  | User or drop not found                                                    |
| `409`  | Not enough stock, or user already has an active reservation for this drop |

### Purchase

**`POST /api/drops/:id/purchase`** — Complete the caller’s active reservation.

|        |                        |
| ------ | ---------------------- |
| Header | `X-User-Id` (required) |
| Body   | none                   |

Success `201` includes `purchaseId`, `dropId`, `userId`, `reservationId`, `quantity`, `purchasedAt`, and current `availableStock`.

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| `400`  | Missing/invalid header or drop id, or no active reservation |
| `404`  | User or drop not found                                      |
| `409`  | Reservation already purchased                               |
| `410`  | Reservation expired                                         |

There are no `/api/users` endpoints.

## Environment Variables

Do not commit `.env` files. Root `.gitignore` ignores `.env`, `server/.env`, and `client/.env`.

### Backend (`server/.env`)

Copy `server/.env.example`:

```
DATABASE_URL=your_neon_database_url
PORT=5000
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

| Variable       | Used for                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | Neon PostgreSQL connection (required)                                                                  |
| `PORT`         | HTTP + Socket.io port for local use (default `5000`). Hosts like Render set this automatically. |
| `CORS_ORIGIN`  | Allowed REST and Socket.io origin (default `http://localhost:5173`)                                    |
| `NODE_ENV`     | Sequelize CLI environment (`development` / `test` / `production` share the same `DATABASE_URL` config) |

### Frontend (`client/.env`)

Copy `client/.env.example`:

```
VITE_API_URL=http://localhost:5000
```

The client falls back to `http://localhost:5000` if `VITE_API_URL` is unset.

## Installation

```bash
git clone <repository-url>
cd SneakerDrop
```

### Backend

```bash
cd server
npm install
```

### Frontend

```bash
cd client
npm install
```

## Database Setup

1. Create a Neon PostgreSQL database.
2. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL`.
3. From `server/`:

```bash
npm run db:migrate
```

Other scripts in `server/package.json`:

```bash
npm run db:migrate:undo
npm run db:migrate:undo:all
```

Insert at least one `users` row before reserving or purchasing (the UI default is Demo User ID `1`). Demo users and drops can be created with:

```bash
node scripts/setup-demo-data.js
```

## Running Locally

Start the API (from `server/`):

```bash
npm run dev
```

or:

```bash
npm start
```

- API: [http://localhost:5000](http://localhost:5000)
- Health: [http://localhost:5000/api/health](http://localhost:5000/api/health)

Start the UI (from `client/`):

```bash
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)

`client/package.json` also includes `npm run build`, `npm run preview`, and `npm run lint`.

## Testing

There is no `npm test` script. Verification lives in `server/scripts/` and expects the API to be running (default port `5000`). From `server/`:

| Script                                      | What it checks                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `node scripts/phase4-reserve-test.js`       | Reserve validation, stock decrease, duplicate reservation, **20 concurrent users vs stock=1** |
| `node scripts/phase5-expiry-test.js`        | Worker expiry, stock restore, no restore for completed reservations, no double restore        |
| `node scripts/phase6-purchase-test.js`      | Purchase success, expired/missing reservation, no second decrement, atomic rollback           |
| `node scripts/phase7-socket-test.js`        | `join_drop` / `leave_drop`, `stock_updated` after commit, no emit on failure                  |
| `node scripts/phase8-activity-feed-test.js` | Top 3 purchasers, per-drop scoping, `purchase_feed_updated`                                   |

These scripts create test drops (and phase 8 may create users `1`–`5` if missing). Phase 4’s concurrency test uses `X-User-Id` values `1` through `20`, which must already exist in `users`.

This README does not record pass/fail results for those scripts.

## Real-Time Demo

About two minutes:

1. Run backend and frontend.
2. Open the app in two browser windows.
3. Set a different **Demo User ID** in each window (matching existing `users.id` values).
4. Open the same drop in both windows.
5. Reserve from one window — both should show the new available stock.
6. Purchase from the window that holds the reservation (within 60 seconds).
7. Both windows should show that user in **Latest Purchasers**.

## Concurrency Demo

Use the phase 4 script against a drop with one unit (the script creates one):

```bash
cd server
node scripts/phase4-reserve-test.js
```

Expected result for stock = 1 and 20 concurrent reserve requests:

- Exactly one `201` reservation
- Remaining requests `409`
- `availableStock` is `0`, never negative

## Deployment

The app is deployed as three pieces:

- Frontend (Vite static build) on [Vercel](https://sneaker-drop-six.vercel.app/)
- Backend (Node HTTP server + Socket.io) on [Render](https://api-sneaker-drop.onrender.com)
- Neon PostgreSQL (`DATABASE_URL`)

Production environment variables:

| Location | Variable | Value |
| -------- | -------- | ----- |
| Vercel   | `VITE_API_URL` | `https://api-sneaker-drop.onrender.com` |
| Render   | `CORS_ORIGIN` | `https://sneaker-drop-six.vercel.app` |
| Render   | `DATABASE_URL` | Neon connection string |
| Render   | `NODE_ENV` | `production` |

Render supplies `PORT`. Do not hardcode it.

**Live Demo:** [https://sneaker-drop-six.vercel.app/](https://sneaker-drop-six.vercel.app/)

## Design / Engineering Decisions

- PostgreSQL is the source of truth for inventory.
- REST handles all mutations; Socket.io only synchronizes committed state.
- Transactions keep reserve, purchase, and expiry consistent.
- `SELECT … FOR UPDATE` prevents concurrent overselling on the drop row.
- Server-side `expiresAt` prevents client-clock manipulation.
- A `setInterval` worker restores expired reservation stock; Redis / a job queue was not required for this assessment.
- `X-User-Id` is an assessment-level identity header, not full authentication.

## Security Notes

- `.env` files are gitignored; do not commit database credentials.
- Secrets come from environment variables (`DATABASE_URL`, and so on).
- Reserve and purchase identify the user with `X-User-Id`. There is no JWT, password, or session auth.
- `availableStock` is never trusted from the client on drop create.
