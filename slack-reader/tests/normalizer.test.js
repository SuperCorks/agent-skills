const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOutput, normalizeConversation } = require('../lib/normalizer');

describe('Slack normalizers', () => {
  it('represents a target reply with its parent and complete thread', () => {
    const parent = { ts: '1000000000.000001', user: 'U1', text: 'parent', reply_count: 1 };
    const reply = {
      ts: '1000000001.000001',
      thread_ts: parent.ts,
      user: 'U2',
      text: 'reply',
      files: [{
        id: 'F1',
        name: 'image.png',
        url_private: 'https://files.slack.com/image.png',
        url_private_download: 'https://files.slack.com/image-download.png',
      }],
    };

    const output = normalizeOutput(
      reply,
      [parent, reply],
      [],
      [],
      { id: 'D1', is_im: true },
      new Map(),
      { url: 'https://example.slack.com/archives/D1/p1000000001000001', workspace: 'example' }
    );

    assert.equal(output.targetMessage.ts, reply.ts);
    assert.equal(output.targetMessage.files[0].urlPrivateDownload, 'https://files.slack.com/image-download.png');
    assert.equal(output.thread.parentTs, parent.ts);
    assert.equal(output.thread.targetIsReply, true);
    assert.equal(output.thread.parent.ts, parent.ts);
    assert.deepEqual(output.thread.replies.map(message => message.ts), [reply.ts]);
  });

  it('uses a resolved display name for direct messages', () => {
    const conversation = normalizeConversation(
      { id: 'D1', is_im: true, user: 'U1' },
      new Map([['U1', { name: 'ada', displayName: 'Ada Lovelace' }]])
    );

    assert.equal(conversation.type, 'im');
    assert.equal(conversation.name, 'Ada Lovelace');
  });
});
