/**
 * Unit tests for Asana URL parser
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseAsanaUrl } = require('../lib/url-parser');

describe('parseAsanaUrl', () => {
  describe('valid URLs', () => {
    it('parses a standard task URL', () => {
      const result = parseAsanaUrl('https://app.asana.com/0/1234567890/9876543210');
      
      assert.deepStrictEqual(result, {
        taskGid: '9876543210',
        projectGid: '1234567890',
      });
    });

    it('parses a task URL with /f suffix', () => {
      const result = parseAsanaUrl('https://app.asana.com/0/1234567890/9876543210/f');
      
      assert.deepStrictEqual(result, {
        taskGid: '9876543210',
        projectGid: '1234567890',
      });
    });

    it('parses an inbox/my-tasks URL (project=0)', () => {
      const result = parseAsanaUrl('https://app.asana.com/0/0/9876543210');
      
      assert.deepStrictEqual(result, {
        taskGid: '9876543210',
        projectGid: null,
      });
    });

    it('parses an inbox/my-tasks URL with /f suffix', () => {
      const result = parseAsanaUrl('https://app.asana.com/0/0/9876543210/f');
      
      assert.deepStrictEqual(result, {
        taskGid: '9876543210',
        projectGid: null,
      });
    });

    it('handles URLs with query parameters', () => {
      const result = parseAsanaUrl('https://app.asana.com/0/1234/5678?tab=comments');
      
      assert.deepStrictEqual(result, {
        taskGid: '5678',
        projectGid: '1234',
      });
    });
  });

  describe('invalid URLs', () => {
    it('throws for null URL', () => {
      assert.throws(
        () => parseAsanaUrl(null),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for empty string', () => {
      assert.throws(
        () => parseAsanaUrl(''),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for non-URL string', () => {
      assert.throws(
        () => parseAsanaUrl('not-a-url'),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for non-Asana URL', () => {
      assert.throws(
        () => parseAsanaUrl('https://google.com/path'),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for Asana URL without proper path', () => {
      assert.throws(
        () => parseAsanaUrl('https://app.asana.com/dashboard'),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for non-numeric task GID', () => {
      assert.throws(
        () => parseAsanaUrl('https://app.asana.com/0/1234/abc'),
        { code: 'ASANA_URL_INVALID' }
      );
    });

    it('throws for non-numeric project GID', () => {
      assert.throws(
        () => parseAsanaUrl('https://app.asana.com/0/abc/1234'),
        { code: 'ASANA_URL_INVALID' }
      );
    });
  });
});
