'use strict';

const { SkillError } = require('./errors');

function parseTaskUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SkillError('ASANA_URL_INVALID', 'The value is not a URL');
  }
  if (url.hostname !== 'app.asana.com') throw new SkillError('ASANA_URL_INVALID', 'Host must be app.asana.com');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === '1' && parts.includes('task')) {
    const gid = parts[parts.indexOf('task') + 1];
    if (/^\d+$/.test(gid || '')) return gid;
  }
  if (parts[0] === '0' && /^\d+$/.test(parts[2] || '')) return parts[2];
  throw new SkillError('ASANA_URL_INVALID', 'Could not find a numeric task GID in the URL');
}

module.exports = { parseTaskUrl };
