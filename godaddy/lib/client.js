const { SkillError } = require('./errors');

function createClient(credentials, options = {}) {
  const baseUrl = (options.baseUrl || credentials.baseUrl || 'https://api.godaddy.com').replace(/\/$/, '');

  return {
    key: credentials.key,
    secret: credentials.secret,
    baseUrl,
  };
}

async function request(client, path, options = {}) {
  const method = options.method || 'GET';
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 500;

  let queryString = '';
  if (options.query && Object.keys(options.query).length > 0) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, String(item));
        }
        continue;
      }

      params.append(key, String(value));
    }

    const encoded = params.toString();
    queryString = encoded ? `?${encoded}` : '';
  }

  const url = `${client.baseUrl}${path}${queryString}`;
  const headers = {
    Authorization: `sso-key ${client.key}:${client.secret}`,
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      const body = await parseResponseBody(response);

      if (response.ok) {
        return body;
      }

      if (response.status === 401) {
        throw new SkillError('GODADDY_AUTH_INVALID', extractMessage(body));
      }

      if (response.status === 404) {
        throw new SkillError('GODADDY_NOT_FOUND', extractMessage(body));
      }

      if (response.status === 429) {
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        throw new SkillError('GODADDY_RATE_LIMITED', extractMessage(body));
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw new SkillError('GODADDY_API_ERROR', `HTTP ${response.status}: ${extractMessage(body)}`);
    } catch (error) {
      if (error instanceof SkillError) {
        throw error;
      }

      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw new SkillError('GODADDY_API_ERROR', error.message);
    }
  }

  throw new SkillError('GODADDY_API_ERROR', 'Unknown request failure');
}

async function parseResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

function extractMessage(body) {
  if (!body) {
    return 'No details provided';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (Array.isArray(body)) {
    return JSON.stringify(body);
  }

  if (Array.isArray(body.fields) && body.fields.length > 0) {
    return body.fields.map((field) => `${field.path || field.name || 'field'}: ${field.message}`).join('; ');
  }

  return body.message || body.msg || body.code || JSON.stringify(body);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listDomains(client, options = {}) {
  return request(client, '/v1/domains', {
    query: options.query,
    headers: buildShopperHeader(options.shopperId),
  });
}

async function listRecords(client, domain, options = {}) {
  return request(client, `/v1/domains/${encodeURIComponent(domain)}/records`, {
    query: options.query,
    headers: buildShopperHeader(options.shopperId),
  });
}

async function listRecordsByTypeName(client, domain, type, name, options = {}) {
  return request(
    client,
    `/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeRecordName(name)}`,
    {
      query: options.query,
      headers: buildShopperHeader(options.shopperId),
    }
  );
}

async function addRecords(client, domain, records, options = {}) {
  return request(client, `/v1/domains/${encodeURIComponent(domain)}/records`, {
    method: 'PATCH',
    body: records,
    headers: buildShopperHeader(options.shopperId),
  });
}

async function replaceRecordsByTypeName(client, domain, type, name, records, options = {}) {
  return request(
    client,
    `/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeRecordName(name)}`,
    {
      method: 'PUT',
      body: records,
      headers: buildShopperHeader(options.shopperId),
    }
  );
}

function buildShopperHeader(shopperId) {
  if (!shopperId) {
    return {};
  }

  return {
    'X-Shopper-Id': shopperId,
  };
}

function encodeRecordName(name) {
  return encodeURIComponent(name);
}

module.exports = {
  createClient,
  request,
  listDomains,
  listRecords,
  listRecordsByTypeName,
  addRecords,
  replaceRecordsByTypeName,
};
