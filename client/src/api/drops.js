const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Demo user identity — no full auth in this phase.
 * Every reserve/purchase call must send X-User-Id.
 */
export const DEMO_USER_ID = 1;

export function getApiUrl() {
  return API_URL;
}

async function request(path, { method = 'GET', userId, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (userId != null) {
    headers['X-User-Id'] = String(userId);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Network error. Please check your connection.');
    err.status = 0;
    throw err;
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const err = new Error(
      (json && json.message) || `Request failed (${response.status})`
    );
    err.status = response.status;
    throw err;
  }

  return json;
}

/** GET /api/drops */
export function getDrops() {
  return request('/api/drops');
}

/** GET /api/drops/:id */
export function getDrop(dropId) {
  return request(`/api/drops/${dropId}`);
}

/** POST /api/drops/:id/reserve */
export function reserveDrop(dropId, userId = DEMO_USER_ID, quantity = 1) {
  return request(`/api/drops/${dropId}/reserve`, {
    method: 'POST',
    userId,
    body: { quantity },
  });
}

/** POST /api/drops/:id/purchase */
export function purchaseDrop(dropId, userId = DEMO_USER_ID) {
  return request(`/api/drops/${dropId}/purchase`, {
    method: 'POST',
    userId,
  });
}

/**
 * Map API errors to short, user-facing messages.
 * Never show stack traces.
 */
export function friendlyErrorMessage(error, context = 'request') {
  const status = error?.status;
  const message = error?.message || '';

  if (status === 0) {
    return 'Network error. Please try again.';
  }

  if (context === 'reserve') {
    if (status === 409 && /stock/i.test(message)) {
      return 'Sorry, this item is no longer available.';
    }
    if (status === 409 && /already have an active reservation/i.test(message)) {
      return 'You already have an active reservation for this drop.';
    }
    return message || 'Reservation failed.';
  }

  if (context === 'purchase') {
    if (status === 400 && /no active reservation/i.test(message)) {
      return 'No active reservation. Reserve first.';
    }
    if (status === 409) {
      return 'Reservation already completed or conflicted.';
    }
    if (status === 410) {
      return 'Your reservation has expired.';
    }
    return message || 'Purchase failed.';
  }

  return message || 'Something went wrong.';
}
