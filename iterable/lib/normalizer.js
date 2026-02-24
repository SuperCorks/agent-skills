function metadata(account, endpoint, params = {}) {
  return {
    fetchedAt: new Date().toISOString(),
    account,
    endpoint,
    params,
  };
}

function normalizeUser(rawResponse, account, endpoint, params = {}) {
  return {
    metadata: metadata(account, endpoint, params),
    user: rawResponse.user || null,
  };
}

function normalizeFields(rawResponse, account, endpoint) {
  const fields = rawResponse.fields || {};

  return {
    metadata: metadata(account, endpoint),
    fields,
    fieldCount: Object.keys(fields).length,
  };
}

function normalizeEvents(rawResponse, account, endpoint, params = {}) {
  const events = rawResponse.events || [];

  return {
    metadata: metadata(account, endpoint, params),
    events,
    eventCount: events.length,
  };
}

function normalizeListUsers(rawResponse, account, endpoint, params = {}) {
  let users = [];

  if (Array.isArray(rawResponse?.users)) {
    users = rawResponse.users;
  } else if (Array.isArray(rawResponse)) {
    users = rawResponse;
  } else if (typeof rawResponse === 'string') {
    users = rawResponse
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return {
    metadata: metadata(account, endpoint, params),
    users,
    userCount: users.length,
  };
}

module.exports = {
  normalizeUser,
  normalizeFields,
  normalizeEvents,
  normalizeListUsers,
};
