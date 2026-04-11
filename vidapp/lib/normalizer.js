function buildMetadata(endpoint, details = {}) {
  return {
    fetchedAt: new Date().toISOString(),
    endpoint,
    ...details,
  };
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function getDefaultThirtyDayWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

module.exports = {
  buildMetadata,
  getDefaultThirtyDayWindow,
};