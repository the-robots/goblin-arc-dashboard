// Helper: normalize CoreV1Api list responses defensively
function normalizeBody(resp) {
  // Possibilities we need to support depending on @kubernetes/client-node version:
  // 1) { body: <object> }
  // 2) <object> directly (i.e., resp.items exists)
  // 3) { body: "<json-string>" }
  // 4) undefined/null (error/edge)
  let body = null;

  if (resp && typeof resp === 'object') {
    // Case 2: direct object with items
    if (Array.isArray(resp.items)) {
      body = resp;
    }
    // Case 1 or 3: resp.body present
    else if ('body' in resp) {
      if (typeof resp.body === 'string') {
        try {
          body = JSON.parse(resp.body);
        } catch {
          body = null;
        }
      } else {
        body = resp.body;
      }
    }
  }

  if (!body || typeof body !== 'object') body = { items: [] };
  if (!Array.isArray(body.items)) body.items = [];
  return body;
}

module.exports = { normalizeBody };
