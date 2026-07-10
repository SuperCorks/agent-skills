const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getMessage,
  getThreadReplies,
  listConversations,
  getConversationHistory,
  searchMessages,
} = require('../lib/client');

describe('Slack client helpers', () => {
  it('requires an exact timestamp match for channel messages', async () => {
    const client = {
      conversations: {
        history: async () => ({ messages: [{ ts: '2000000000.000001' }] }),
      },
    };

    await assert.rejects(
      getMessage(client, 'C123', '1000000000.000001'),
      { code: 'SLACK_MESSAGE_NOT_FOUND' }
    );
  });

  it('finds a message inside a thread', async () => {
    const client = {
      conversations: {
        replies: async () => ({
          messages: [
            { ts: '1000000000.000001' },
            { ts: '1000000001.000001', thread_ts: '1000000000.000001' },
          ],
          response_metadata: { next_cursor: '' },
        }),
      },
    };

    const message = await getMessage(
      client,
      'C123',
      '1000000001.000001',
      '1000000000.000001'
    );
    assert.equal(message.ts, '1000000001.000001');
  });

  it('paginates complete threads', async () => {
    let calls = 0;
    const client = {
      conversations: {
        replies: async ({ cursor }) => {
          calls += 1;
          return cursor
            ? { messages: [{ ts: '3' }], response_metadata: { next_cursor: '' } }
            : { messages: [{ ts: '1' }, { ts: '2' }], response_metadata: { next_cursor: 'next' } };
        },
      },
    };

    const messages = await getThreadReplies(client, 'C123', '1');
    assert.deepEqual(messages.map(message => message.ts), ['1', '2', '3']);
    assert.equal(calls, 2);
  });

  it('lists conversations up to the requested limit', async () => {
    const client = {
      conversations: {
        list: async ({ limit }) => ({
          channels: Array.from({ length: limit }, (_, index) => ({ id: `C${index}` })),
          response_metadata: { next_cursor: 'more' },
        }),
      },
    };

    const result = await listConversations(client, { limit: 3 });
    assert.equal(result.conversations.length, 3);
    assert.equal(result.nextCursor, 'more');
  });

  it('passes history bounds and search options to Slack', async () => {
    let historyArgs;
    let searchArgs;
    const client = {
      conversations: {
        history: async args => {
          historyArgs = args;
          return { messages: [], response_metadata: { next_cursor: '' } };
        },
      },
      search: {
        messages: async args => {
          searchArgs = args;
          return { ok: true, messages: { matches: [] } };
        },
      },
    };

    await getConversationHistory(client, 'D123', {
      limit: 10,
      oldest: '1000000000.000000',
      latest: '2000000000.000000',
      inclusive: true,
    });
    await searchMessages(client, 'quarterly plan', {
      count: 50,
      page: 2,
      sort: 'timestamp',
      sortDir: 'asc',
    });

    assert.equal(historyArgs.channel, 'D123');
    assert.equal(historyArgs.oldest, '1000000000.000000');
    assert.equal(historyArgs.latest, '2000000000.000000');
    assert.equal(historyArgs.inclusive, true);
    assert.deepEqual(searchArgs, {
      query: 'quarterly plan',
      count: 50,
      page: 2,
      sort: 'timestamp',
      sort_dir: 'asc',
    });
  });

  it('reports the exact missing scope', async () => {
    const client = {
      search: {
        messages: async () => {
          const error = new Error('missing scope');
          error.data = { error: 'missing_scope', needed: 'search:read' };
          throw error;
        },
      },
    };

    await assert.rejects(
      searchMessages(client, 'plan'),
      error => error.code === 'SLACK_PERMISSION_DENIED' && error.message.includes('search:read')
    );
  });
});
