'use strict';

const { mapAsanaError } = require('./errors');

const TASK_FIELDS = [
  'gid', 'name', 'notes', 'html_notes', 'completed', 'completed_at', 'due_on', 'due_at',
  'start_on', 'start_at', 'resource_subtype', 'assignee.gid', 'assignee.name', 'followers.gid',
  'followers.name', 'projects.gid', 'projects.name', 'memberships.project.gid', 'memberships.project.name',
  'memberships.section.gid', 'memberships.section.name', 'tags.gid', 'tags.name', 'parent.gid',
  'parent.name', 'custom_fields.gid', 'custom_fields.name', 'custom_fields.display_value',
  'custom_fields.text_value', 'custom_fields.number_value', 'custom_fields.date_value',
  'custom_fields.enum_value.gid', 'custom_fields.multi_enum_values.gid', 'custom_fields.people_value.gid',
  'permalink_url', 'created_at', 'modified_at',
].join(',');

const PROJECT_FIELDS = [
  'gid', 'name', 'notes', 'html_notes', 'archived', 'color', 'public', 'start_on', 'due_on',
  'owner.gid', 'owner.name', 'team.gid', 'team.name', 'workspace.gid', 'workspace.name',
  'permalink_url', 'created_at', 'modified_at',
].join(',');

function createClient(asana, token) {
  const apiClient = new asana.ApiClient();
  apiClient.authentications.token.accessToken = token;
  return {
    apiClient,
    tasks: new asana.TasksApi(apiClient),
    stories: new asana.StoriesApi(apiClient),
    workspaces: new asana.WorkspacesApi(apiClient),
    projects: new asana.ProjectsApi(apiClient),
    sections: new asana.SectionsApi(apiClient),
    teams: new asana.TeamsApi(apiClient),
    users: new asana.UsersApi(apiClient),
    tags: new asana.TagsApi(apiClient),
    customFieldSettings: new asana.CustomFieldSettingsApi(apiClient),
  };
}

function entity(result) {
  return result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
}

async function collection(result) {
  const first = await result;
  if (!first) return [];
  const all = [...(first.data || [])];
  let page = first;
  while (typeof page.nextPage === 'function') {
    page = await page.nextPage();
    if (!page?.data) break;
    all.push(...page.data);
  }
  return all;
}

async function read(operation, callback) {
  try {
    return await callback();
  } catch (error) {
    throw mapAsanaError(error, { operation, write: false });
  }
}

async function write(operation, callback) {
  try {
    return await callback();
  } catch (error) {
    throw mapAsanaError(error, { operation, write: true });
  }
}

async function getTask(client, taskGid) {
  return read('get-task', async () => entity(await client.tasks.getTask(taskGid, { opt_fields: TASK_FIELDS })));
}

async function getProject(client, projectGid) {
  return read('get-project', async () => entity(await client.projects.getProject(projectGid, { opt_fields: PROJECT_FIELDS })));
}

async function getSection(client, sectionGid) {
  return read('get-section', async () => entity(await client.sections.getSection(sectionGid, { opt_fields: 'gid,name,project.gid,project.name,created_at' })));
}

module.exports = { TASK_FIELDS, PROJECT_FIELDS, createClient, entity, collection, read, write, getTask, getProject, getSection };
