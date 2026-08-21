'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../lib/client');

it('uses isolated API clients for different account tokens', () => {
  class ApiClient {
    constructor() {
      this.authentications = { token: {} };
    }
  }
  class Api {
    constructor(client) {
      this.client = client;
    }
  }
  const asana = {
    ApiClient,
    TasksApi: Api,
    StoriesApi: Api,
    WorkspacesApi: Api,
    ProjectsApi: Api,
    SectionsApi: Api,
    TeamsApi: Api,
    UsersApi: Api,
    TagsApi: Api,
    CustomFieldSettingsApi: Api,
  };

  const first = createClient(asana, '0/first');
  const second = createClient(asana, '0/second');

  assert.notEqual(first.apiClient, second.apiClient);
  assert.equal(first.apiClient.authentications.token.accessToken, '0/first');
  assert.equal(second.apiClient.authentications.token.accessToken, '0/second');
  assert.equal(first.tasks.client, first.apiClient);
  assert.equal(second.tasks.client, second.apiClient);
});
