// Append-only audit log (in-memory for the seed).
const events = [];

/**
 * Record an append-only audit event.
 * @param {string} userId
 * @param {string} type   e.g. "items.deleted"
 * @param {object} [metadata]
 */
export function recordAuditEvent(userId, type, metadata = {}) {
  const event = {
    id: `evt_${events.length + 1}`,
    userId,
    type,
    metadata,
    at: new Date().toISOString(),
  };
  events.push(event);
  return event;
}

/** List a single user's audit events (scoped). */
export function listAuditEvents(userId) {
  return events.filter((e) => e.userId === userId);
}

/** Test helper — reset the in-memory log. */
export function _reset() {
  events.length = 0;
}
