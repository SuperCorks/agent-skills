'use strict';

const { SkillError } = require('./errors');

function requireAsanaSDK() {
  try {
    return require('asana');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') throw new SkillError('ASANA_SDK_MISSING');
    throw error;
  }
}

module.exports = { requireAsanaSDK };
