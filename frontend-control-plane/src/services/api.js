const BASE_URL = '/api';

function extractErrorMessage(payload, status) {
  if (!payload) return `HTTP ${status}`;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        const location = Array.isArray(entry?.loc) ? entry.loc.join('.') : 'field';
        const message = entry?.msg || 'Invalid value';
        return `${location}: ${message}`;
      })
      .join('; ');
  }
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return `HTTP ${status}`;
}

function attachCommonHeaders(headers, version) {
  const token = localStorage.getItem('access_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (version !== undefined && version !== null && version !== '') {
    headers['If-Match'] = `"${version}"`;
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const version = options.version;
  attachCommonHeaders(headers, version);

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 409) {
    const err = new Error(extractErrorMessage(payload, 409) || 'Version conflict');
    err.status = 409;
    err.detail = payload;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(extractErrorMessage(payload, response.status));
    err.status = response.status;
    err.detail = payload;
    throw err;
  }

  return payload;
}

export function get(path) {
  return request(path, { method: 'GET' });
}

export function post(path, body, options = {}) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    version: options.version,
  });
}

export function patch(path, body, options = {}) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    version: options.version,
  });
}

export function postRawJson(path, rawJson, options = {}) {
  return request(path, {
    method: 'POST',
    body: rawJson,
    headers: { 'Content-Type': 'application/json' },
    version: options.version,
  });
}

export default { get, post, patch, postRawJson };
