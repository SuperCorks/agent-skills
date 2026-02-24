const { SkillError } = require('./errors');

function createClient(apiKey, options = {}) {
  const baseUrl = options.baseUrl || 'https://api.iterable.com/api';

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
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
      if (value === undefined || value === null) {
        continue;
      }
      params.append(key, String(value));
    }
    queryString = `?${params.toString()}`;
  }

  const url = `${client.baseUrl}${path}${queryString}`;
  const headers = {
    'Api-Key': client.apiKey,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (response.ok) {
        return body;
      }

      if (response.status === 401) {
        throw new SkillError('ITERABLE_AUTH_INVALID', extractMessage(body));
      }
      if (response.status === 404) {
        throw new SkillError('ITERABLE_NOT_FOUND', extractMessage(body));
      }

      if (response.status === 429) {
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new SkillError('ITERABLE_RATE_LIMITED', extractMessage(body));
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw new SkillError('ITERABLE_API_ERROR', `HTTP ${response.status}: ${extractMessage(body)}`);
    } catch (error) {
      if (error instanceof SkillError) {
        throw error;
      }

      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw new SkillError('ITERABLE_API_ERROR', error.message);
    }
  }

  throw new SkillError('ITERABLE_API_ERROR', 'Unknown request failure');
}

function extractMessage(body) {
  if (!body) {
    return 'No details provided';
  }
  if (typeof body === 'string') {
    return body;
  }
  return body.msg || body.message || body.error || JSON.stringify(body);
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getUserByEmail(client, email) {
  return request(client, '/users/getByEmail', {
    query: { email },
  });
}

async function getUserByUserId(client, userId) {
  return request(client, '/users/byUserId', {
    query: { userId },
  });
}

async function getUserFields(client) {
  return request(client, '/users/getFields');
}

async function getUserEventsByEmail(client, email, limit = 30) {
  return request(client, `/events/${encodeURIComponent(email)}`, {
    query: { limit },
  });
}

async function getUserEventsByUserId(client, userId, limit = 30) {
  return request(client, `/events/byUserId/${encodeURIComponent(userId)}`, {
    query: { limit },
  });
}

async function getUsersInList(client, listId, preferUserId = false) {
  return request(client, '/lists/getUsers', {
    query: {
      listId,
      preferUserId,
    },
  });
}

module.exports = {
  createClient,
  request,
  getUserByEmail,
  getUserByUserId,
  getUserFields,
  getUserEventsByEmail,
  getUserEventsByUserId,
  getUsersInList,
};
