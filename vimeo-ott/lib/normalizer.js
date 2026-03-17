function buildMetadata(account, endpoint, details = {}) {
  return {
    fetchedAt: new Date().toISOString(),
    account,
    endpoint,
    ...details,
  };
}

function summarizePage(body, embeddedKey) {
  const embedded = body?._embedded?.[embeddedKey];
  return {
    count: body?.count ?? null,
    total: body?.total ?? null,
    items: Array.isArray(embedded) ? embedded : [],
    links: body?._links || {},
  };
}

module.exports = {
  buildMetadata,
  summarizePage,
};