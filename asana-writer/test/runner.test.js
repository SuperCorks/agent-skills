'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execute } = require('../lib/runner');

const ENV = { ASANA_ACCOUNTS: '{"work":"0/not-printed"}' };

function resource(value) {
  return Promise.resolve({ data: value });
}

function list(values = []) {
  return Promise.resolve({ data: values });
}

function baseClient(overrides = {}) {
  const task = {
    gid: '100', name: 'Existing', completed: false, tags: [], custom_fields: [], followers: [],
    memberships: [], projects: [], permalink_url: 'https://app.asana.com/0/1/100',
  };
  return {
    tasks: {
      getTask: () => resource(task),
      getTasksForProject: () => list([]),
      getTasksForSection: () => list([]),
      getSubtasksForTask: () => list([]),
      getDependenciesForTask: () => list([]),
      getDependentsForTask: () => list([]),
    },
    projects: {
      getProject: () => resource({ gid: '200', name: 'Project', custom_fields: [] }),
      getProjectsForWorkspace: () => list([]),
    },
    sections: {
      getSection: () => resource({ gid: '300', name: 'Section', project: { gid: '200' } }),
      getSectionsForProject: () => list([]),
    },
    workspaces: {
      getWorkspace: () => resource({ gid: '400', name: 'Workspace', is_organization: false }),
      getWorkspaces: () => list([]),
    },
    users: { getUser: () => resource({ gid: '500', name: 'User' }) },
    teams: {},
    tags: {},
    customFieldSettings: {},
    stories: {},
    ...overrides,
  };
}

describe('command execution', () => {
  it('lists account aliases without returning tokens', async () => {
    const result = await execute('list-accounts', [], { env: ENV });
    assert.deepEqual(result.accounts, ['work']);
    assert.equal(JSON.stringify(result).includes('not-printed'), false);
  });

  it('dry-runs task creation without a mutating call', async () => {
    let writes = 0;
    const client = baseClient({
      tasks: {
        ...baseClient().tasks,
        createTask: () => { writes += 1; },
      },
    });
    const result = await execute('create-task', ['--project', '200', '--name', 'New task', '--dry-run', '--account', 'work'], { env: ENV, client, asana: {} });
    assert.equal(writes, 0);
    assert.equal(result.metadata.dryRun, true);
    assert.equal(result.requested.data.name, 'New task');
  });

  it('performs immediate task creation, placement, and post-write verification', async () => {
    const calls = [];
    const tasks = {
      ...baseClient().tasks,
      createTask: (body) => {
        calls.push(['create', body]);
        return resource({ gid: '101' });
      },
      addProjectForTask: (body, gid) => {
        calls.push(['place', body, gid]);
        return resource({});
      },
      getTask: (gid) => resource({ gid, name: 'New task', memberships: [{ project: { gid: '200' }, section: { gid: '300' } }] }),
    };
    const result = await execute('create-task', ['--project', '200', '--section', '300', '--name', 'New task', '--account', 'work'], {
      env: ENV, client: baseClient({ tasks }), asana: {},
    });
    assert.deepEqual(calls.map((call) => call[0]), ['create', 'place']);
    assert.deepEqual(calls[0][1], { data: { name: 'New task', projects: ['200'] } });
    assert.deepEqual(calls[1][1], { data: { project: '200', section: '300' } });
    assert.equal(result.result.gid, '101');
  });

  it('sends only changed task fields and skips equal fields', async () => {
    let updateBody;
    let reads = 0;
    const tasks = {
      ...baseClient().tasks,
      getTask: () => {
        reads += 1;
        return resource({ gid: '100', name: reads === 1 ? 'Old' : 'New', completed: false, assignee: { gid: '500' }, custom_fields: [] });
      },
      updateTask: (body) => {
        updateBody = body;
        return resource({});
      },
    };
    const result = await execute('update-task', ['--id', '100', '--name', 'New', '--assignee', '500', '--account', 'work'], {
      env: ENV, client: baseClient({ tasks }), asana: {},
    });
    assert.deepEqual(updateBody, { data: { name: 'New' } });
    assert.deepEqual(result.changed, ['name']);
    assert.equal(reads, 2);
  });

  it('clears only the active due-date representation', async () => {
    let updateBody;
    let reads = 0;
    const tasks = {
      ...baseClient().tasks,
      getTask: () => {
        reads += 1;
        return resource({ gid: '100', name: 'Task', due_on: reads === 1 ? '2026-09-01' : null, due_at: null, custom_fields: [] });
      },
      updateTask: (body) => {
        updateBody = body;
        return resource({});
      },
    };
    await execute('update-task', ['--id', '100', '--clear-due', '--account', 'work'], {
      env: ENV, client: baseClient({ tasks }), asana: {},
    });
    assert.deepEqual(updateBody, { data: { due_on: null } });
  });

  it('adds and removes only necessary tags', async () => {
    const calls = [];
    let reads = 0;
    const tasks = {
      ...baseClient().tasks,
      getTask: () => {
        reads += 1;
        return resource({ gid: '100', name: 'Task', tags: reads === 1 ? [{ gid: '1' }, { gid: '2' }] : [{ gid: '2' }, { gid: '3' }] });
      },
      removeTagForTask: (body) => { calls.push(['remove', body]); return resource({}); },
      addTagForTask: (body) => { calls.push(['add', body]); return resource({}); },
    };
    const result = await execute('set-task-tags', ['--id', '100', '--add', '2,3', '--remove', '1,4', '--account', 'work'], {
      env: ENV, client: baseClient({ tasks }), asana: {},
    });
    assert.deepEqual(calls, [
      ['remove', { data: { tag: '1' } }],
      ['add', { data: { tag: '3' } }],
    ]);
    assert.deepEqual(result.changed, ['remove:1', 'add:3']);
  });

  it('creates and verifies a comment', async () => {
    const calls = [];
    const stories = {
      createStoryForTask: (body, taskGid) => {
        calls.push([body, taskGid]);
        return resource({ gid: '700' });
      },
      getStory: (gid) => resource({ gid, text: 'Ready' }),
    };
    const result = await execute('add-comment', ['--id', '100', '--text', 'Ready', '--account', 'work'], {
      env: ENV, client: baseClient({ stories }), asana: {},
    });
    assert.deepEqual(calls, [[{ data: { text: 'Ready' } }, '100']]);
    assert.deepEqual(result.result, { gid: '700', text: 'Ready' });
  });

  it('requires a team before writing a project in an organization', async () => {
    let writes = 0;
    const client = baseClient({
      workspaces: { getWorkspace: () => resource({ gid: '400', is_organization: true }) },
      projects: {
        ...baseClient().projects,
        createProjectForWorkspace: () => { writes += 1; },
      },
    });
    await assert.rejects(
      execute('create-project', ['--workspace', '400', '--name', 'Project', '--account', 'work'], { env: ENV, client, asana: {} }),
      { code: 'ASANA_ARGUMENT_INVALID' },
    );
    assert.equal(writes, 0);
  });

  it('rejects exact-name task duplicates unless overridden', async () => {
    const tasks = {
      ...baseClient().tasks,
      getTasksForProject: () => list([{ gid: '999', name: 'Duplicate' }]),
    };
    await assert.rejects(
      execute('create-task', ['--project', '200', '--name', 'Duplicate', '--account', 'work'], {
        env: ENV, client: baseClient({ tasks }), asana: {},
      }),
      { code: 'ASANA_DUPLICATE_FOUND' },
    );
  });

  it('enforces the combined dependency limit before writing', async () => {
    const dependencies = Array.from({ length: 20 }, (_, index) => ({ gid: String(1000 + index) }));
    const dependents = Array.from({ length: 10 }, (_, index) => ({ gid: String(2000 + index) }));
    const tasks = {
      ...baseClient().tasks,
      getDependenciesForTask: () => list(dependencies),
      getDependentsForTask: () => list(dependents),
    };
    await assert.rejects(
      execute('set-task-dependencies', ['--id', '100', '--add', '9999', '--account', 'work'], {
        env: ENV, client: baseClient({ tasks }), asana: {},
      }),
      { code: 'ASANA_ARGUMENT_INVALID' },
    );
  });

  it('does not retry a failed create and marks an uncertain write', async () => {
    let attempts = 0;
    const tasks = {
      ...baseClient().tasks,
      createTask: async () => {
        attempts += 1;
        const error = new Error('gateway timeout');
        error.status = 503;
        throw error;
      },
    };
    await assert.rejects(
      execute('create-task', ['--project', '200', '--name', 'Uncertain', '--account', 'work'], {
        env: ENV, client: baseClient({ tasks }), asana: {},
      }),
      { code: 'ASANA_WRITE_UNCERTAIN', outcomeUncertain: true },
    );
    assert.equal(attempts, 1);
  });
});
