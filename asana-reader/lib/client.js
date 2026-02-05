/**
 * Asana API wrapper using asana SDK v3.x
 */

const { SkillError } = require('./errors');

/**
 * Create Asana API instances configured with a token
 * 
 * @param {typeof import('asana')} asana - Asana SDK module
 * @param {string} token - Personal Access Token
 * @returns {Object} Object with API instances
 */
function createClient(asana, token) {
  // Configure the global API client with the token
  const apiClient = asana.ApiClient.instance;
  apiClient.authentications['token'].accessToken = token;
  
  // Return API instances
  return {
    tasks: new asana.TasksApi(),
    stories: new asana.StoriesApi(),
    typeahead: new asana.TypeaheadApi(),
    workspaces: new asana.WorkspacesApi(),
    projects: new asana.ProjectsApi(),
  };
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
 * @param {Object} client - Client from createClient
 * @param {string} taskGid - Task GID
 * @returns {Promise<Object>} Task object
 * @throws {SkillError}
 */
async function getTask(client, taskGid) {
  try {
    const result = await client.tasks.getTask(taskGid, {
      opt_fields: TASK_OPT_FIELDS,
    });
    return result.data;
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Get comments (stories) for a task
 * 
 * @param {Object} client - Client from createClient
 * @param {string} taskGid - Task GID
 * @returns {Promise<Object[]>} Array of comment story objects
 * @throws {SkillError}
 */
async function getTaskComments(client, taskGid) {
  try {
    const result = await client.stories.getStoriesForTask(taskGid, {
      opt_fields: 'text,created_at,created_by,created_by.name,type,resource_subtype',
    });

    // Get all stories from result.data
    const allStories = result.data || [];

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
 * @param {Object} client - Client from createClient
 * @param {string} workspaceGid - Workspace GID 
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Array of matching tasks
 * @throws {SkillError}
 */
async function searchTasks(client, workspaceGid, query) {
  try {
    const result = await client.typeahead.typeaheadForWorkspace(workspaceGid, {
      resource_type: 'task',
      query,
      opt_fields: 'name,completed',
    });

    return result.data || [];
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Get workspaces for the authenticated user
 * 
 * @param {Object} client - Client from createClient
 * @returns {Promise<Object[]>} Array of workspace objects
 * @throws {SkillError}
 */
async function getWorkspaces(client) {
  try {
    const result = await client.workspaces.getWorkspaces({
      opt_fields: 'name,is_organization',
    });

    return result.data || [];
  } catch (err) {
    if (err instanceof SkillError) throw err;
    handleAsanaError(err);
  }
}

/**
 * Get projects for a workspace
 * 
 * @param {Object} client - Client from createClient
 * @param {string} workspaceGid - Workspace GID
 * @param {Object} options - Optional filters
 * @param {boolean} options.archived - Include archived projects (default: false)
 * @returns {Promise<Object[]>} Array of project objects
 * @throws {SkillError}
 */
async function getProjects(client, workspaceGid, options = {}) {
  try {
    const result = await client.projects.getProjectsForWorkspace(workspaceGid, {
      opt_fields: 'name,archived,color,created_at,modified_at,owner,owner.name,notes,permalink_url',
      archived: options.archived || false,
    });

    return result.data || [];
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
  getProjects,
  TASK_OPT_FIELDS,
};
