const { SkillError } = require('./errors');

function getApiKey() {
  const apiKey = process.env.VIDAPP_API_KEY?.trim();
  if (!apiKey) {
    throw new SkillError('VIDAPP_AUTH_MISSING');
  }

  return apiKey;
}

function resolveAppId(appId) {
  const value = String(appId || process.env.VIDAPP_APP_ID || '').trim();
  if (!value) {
    throw new SkillError('VIDAPP_APP_ID_MISSING');
  }

  return value;
}

module.exports = {
  getApiKey,
  resolveAppId,
};