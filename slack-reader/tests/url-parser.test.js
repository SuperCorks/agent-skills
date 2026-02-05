/**
 * Unit tests for Slack URL parser
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseSlackUrl } = require('../lib/url-parser');

describe('parseSlackUrl', () => {
  describe('valid URLs', () => {
    it('parses a standard channel message URL', () => {
      const result = parseSlackUrl('https://companyname.slack.com/archives/C0123456789/p1699485123456789');
      
      assert.deepStrictEqual(result, {
        workspace: 'companyname',
        channelId: 'C0123456789',
        messageTs: '1699485123.456789',
      });
    });

    it('parses a DM message URL', () => {
      const result = parseSlackUrl('https://workspace.slack.com/archives/D0123456789/p1234567890000000');
      
      assert.deepStrictEqual(result, {
        workspace: 'workspace',
        channelId: 'D0123456789',
        messageTs: '1234567890.000000',
      });
    });

    it('parses a group channel URL', () => {
      const result = parseSlackUrl('https://test.slack.com/archives/G0123456789/p1111111111111111');
      
      assert.deepStrictEqual(result, {
        workspace: 'test',
        channelId: 'G0123456789',
        messageTs: '1111111111.111111',
      });
    });

    it('parses URL with thread_ts query param', () => {
      const result = parseSlackUrl('https://example.slack.com/archives/C12345/p1699485123456789?thread_ts=1699485000.000000');
      
      assert.deepStrictEqual(result, {
        workspace: 'example',
        channelId: 'C12345',
        messageTs: '1699485123.456789',
      });
    });
  });

  describe('invalid URLs', () => {
    it('throws for null URL', () => {
      assert.throws(
        () => parseSlackUrl(null),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for empty string', () => {
      assert.throws(
        () => parseSlackUrl(''),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for non-URL string', () => {
      assert.throws(
        () => parseSlackUrl('not-a-url'),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for non-Slack URL', () => {
      assert.throws(
        () => parseSlackUrl('https://google.com/path'),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for Slack URL without archives path', () => {
      assert.throws(
        () => parseSlackUrl('https://workspace.slack.com/channel/C123'),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for invalid channel ID format', () => {
      assert.throws(
        () => parseSlackUrl('https://workspace.slack.com/archives/invalid/p1234567890123456'),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for timestamp without p prefix', () => {
      assert.throws(
        () => parseSlackUrl('https://workspace.slack.com/archives/C123/1234567890123456'),
        { code: 'SLACK_URL_INVALID' }
      );
    });

    it('throws for timestamp with wrong digit count', () => {
      assert.throws(
        () => parseSlackUrl('https://workspace.slack.com/archives/C123/p12345'),
        { code: 'SLACK_URL_INVALID' }
      );
    });
  });
});
