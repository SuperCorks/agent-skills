/**
 * Asana API wrapper using asana SDK
 */

const { SkillError } = require('./errors');

/**
 * Create an Asana API client
 * 
 * @param {typeof import('asana')} asana - Asana SDK module
 * @param {string} token - Personal Access Token
 * @returns {import('asana').Client} Configured Asana client
 */
function createClient(asana, token) {
  return asana.Client.create().useAccessToken(token);
}

/**
 * Handle Asana API errors and convert to SkillError
 * 
 * @param {Error} err - Error from Asana API
 * @throws {SkillError}
 */
function handleAsanaError(err) {
  const status = err.status || err.statusCode;
  const errorMessage = err.value?.errors?.[0]?.message || err.message;

  switch (status) {
    case 401:
      throw new SkillError('ASANA_AUTH_INVALID', errorMessage);
    
    case 403:
      throw new SkillError('ASANA_TASK_NOT_FOUND', 'Permission denied');
    
    case 404:
      throw new SkillError('ASANA_TASK_NOT_FOUND', errorMessage);
    
    case 429:
      throw new SkillError('ASANA_RATE_LIMITED');
    
    default:
      throw new SkillError('ASANA_API_ERROR', errorMessage);
  }
}

// Fields to request for task details
const TASK_OPT_FIELDS = [
  'name',
  'notes',
  'completed',
  'completed_at',
  'due_on',
  'due_at',
  'start_on',
  'start_at',
  'assignee',
  'assignee.name',
  'projects',
  'projects.name',
  'tags',
  'tags.name',
  'parent',
  'parent.name',
  'num_subtasks',
  'created_at',
  'modified_at',
  'permalink_url',
  'custom_fields',
  'custom_fields.name',
  'custom_fields.display_value',
  'custom_fields.type',
].join(',');

/**
 * Get a task by GID with full details
 * 
 * @param {import('asana').Client} client
 * @param {string} taskGid - Task GID
 * @returns {Promise<Object>} Task object
 * @throws {SkillError}
 */
async function getTask(client, taskGid) {
  try {
    const task = await client.tasks.findById(taskGid, {
      opt_fields: TASK_OPT_FIELDS,
    });
    return task;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Get comments (stories) for a task
 * 
 * @param {import('asana').Client} client
 * @param {string} taskGid - Task GID
 * @returns {Promise<Object[]>} Array of comment story objects
 * @throws {SkillError}
 */
async function getTaskComments(client, taskGid) {
  try {
    const stories = await client.stories.findByTask(taskGid, {
      opt_fields: 'text,created_at,created_by,created_by.name,type,resource_subtype',
    });

    // Collect all stories (it's an async iterator)
    const allStories = [];
    for await (const story of stories) {
      allStories.push(story);
    }

    // Filter to only comments
    return allStories.filter(s => s.type === 'comment' || s.resource_subtype === 'comment_added');
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Search for tasks using typeahead API
 * 
 * @param {import('asana').Client} client
 * @param {string} workspaceGid - Workspace GID 
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Array of matching tasks
 * @throws {SkillError}
 */
async function searchTasks(client, workspaceGid, query) {
  try {
    const results = await client.typeahead.typeaheadForWorkspace(workspaceGid, {
      resource_type: 'task',
      query,
      opt_fields: 'name,completed',
    });

    // Collect results
    const tasks = [];
    for await (const task of results) {
      tasks.push(task);
    }
    return tasks;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Get workspaces for the authenticated user
 * 
 * @param {import('asana').Client} client
 * @returns {Promise<Object[]>} Array of workspace objects
 * @throws {SkillError}
 */
async function getWorkspaces(client) {
  try {
    const workspaces = await client.workspaces.findAll({
      opt_fields: 'name,is_organization',
    });

    // Collect results
    const all = [];
    for await (const ws of workspaces) {
      all.push(ws);
    }
    return all;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

module.exports = {
  createClient,
  getTask,
  getTaskComments,
  searchTasks,
  getWorkspaces,
  TASK_OPT_FIELDS,
};
