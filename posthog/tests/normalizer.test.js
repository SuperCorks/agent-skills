const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProjectList, summarizeProject } = require('../lib/normalizer');

const project = {
  id: 123,
  name: 'Production',
  organization: 'org-id',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  timezone: 'UTC',
  is_demo: false,
  user_access_level: 'admin',
  api_token: 'phc_project_token',
  live_events_token: 'signed-live-events-token',
  secret_api_token: 'secret-project-token',
};

test('summarizeProject exposes project metadata without project-side tokens', () => {
  assert.deepEqual(summarizeProject(project), {
    id: 123,
    name: 'Production',
    organization: 'org-id',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    timezone: 'UTC',
    isDemo: false,
    userAccessLevel: 'admin',
  });
});

test('normalizeProjectList summarizes every project in paginated responses', () => {
  const result = normalizeProjectList({ count: 1, results: [project] });

  assert.equal(result.count, 1);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].name, 'Production');
  assert.equal('api_token' in result.projects[0], false);
  assert.equal('live_events_token' in result.projects[0], false);
  assert.equal('secret_api_token' in result.projects[0], false);
});
