import { appendJsonl, auditFile, id } from './util.js';

export function audit(type, details = {}) {
  const event = { id: id(), at: new Date().toISOString(), type, details };
  appendJsonl(auditFile, event);
  return event;
}
