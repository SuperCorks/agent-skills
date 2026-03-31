function buildMetadata(account, endpoint, extra = {}) {
  return {
    fetchedAt: new Date().toISOString(),
    account,
    endpoint,
    ...extra,
  };
}

function normalizeDomainSummary(domain) {
  return {
    domain: domain.domain,
    status: domain.status,
    createdAt: domain.createdAt,
    expires: domain.expires,
    renewAuto: domain.renewAuto,
    renewable: domain.renewable,
    locked: domain.locked,
    privacy: domain.privacy,
    nameServers: domain.nameServers || null,
  };
}

function normalizeRecord(record) {
  return compactObject({
    type: record.type,
    name: record.name,
    data: record.data,
    ttl: record.ttl,
    priority: record.priority,
    service: record.service,
    protocol: record.protocol,
    weight: record.weight,
    port: record.port,
  });
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

module.exports = {
  buildMetadata,
  normalizeDomainSummary,
  normalizeRecord,
  compactObject,
};
