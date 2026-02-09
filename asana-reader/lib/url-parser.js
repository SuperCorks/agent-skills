/**
 * Parse Asana task URLs
 * 
 * Formats:
 * - https://app.asana.com/0/PROJECT/TASK
 * - https://app.asana.com/0/PROJECT/TASK/f
 * - https://app.asana.com/0/0/TASK/f (inbox/my tasks view)
 * - https://app.asana.com/1/WORKSPACE/project/PROJECT/task/TASK (new format)
 */

const { SkillError } = require('./errors');

/**
 * Parse an Asana task URL
 * 
 * @param {string} url - Asana task URL
 * @returns {{ taskGid: string, projectGid: string | null, workspaceGid: string | null }}
 * @throws {SkillError} If the URL format is invalid
 */
function parseAsanaUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new SkillError('ASANA_URL_INVALID', 'URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SkillError('ASANA_URL_INVALID', 'Not a valid URL');
  }

  // Verify it's an Asana URL
  if (parsed.hostname !== 'app.asana.com') {
    throw new SkillError('ASANA_URL_INVALID', 'Not an Asana URL');
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);

  // New format: /1/WORKSPACE/project/PROJECT/task/TASK
  if (pathParts[0] === '1' && pathParts.includes('task')) {
    const taskIndex = pathParts.indexOf('task');
    if (taskIndex === -1 || taskIndex + 1 >= pathParts.length) {
      throw new SkillError('ASANA_URL_INVALID', 'Missing task GID in URL');
    }
    
    const taskGid = pathParts[taskIndex + 1];
    if (!/^\d+$/.test(taskGid)) {
      throw new SkillError('ASANA_URL_INVALID', `Invalid task GID: ${taskGid}`);
    }

    // Extract workspace and project if present
    const workspaceGid = pathParts[1] && /^\d+$/.test(pathParts[1]) ? pathParts[1] : null;
    const projectIndex = pathParts.indexOf('project');
    const projectGid = projectIndex !== -1 && projectIndex + 1 < pathParts.length 
      ? pathParts[projectIndex + 1] 
      : null;

    return { taskGid, projectGid, workspaceGid };
  }

  // Classic format: /0/PROJECT/TASK or /0/PROJECT/TASK/f
  if (pathParts.length < 3 || pathParts[0] !== '0') {
    throw new SkillError('ASANA_URL_INVALID', 'Expected /0/PROJECT/TASK or /1/.../task/TASK format');
  }

  const projectGid = pathParts[1];
  const taskGid = pathParts[2];

  // Validate GIDs are numeric
  if (!/^\d+$/.test(taskGid)) {
    throw new SkillError('ASANA_URL_INVALID', `Invalid task GID: ${taskGid}`);
  }

  // Project GID can be "0" for inbox/my tasks views
  if (!/^\d+$/.test(projectGid)) {
    throw new SkillError('ASANA_URL_INVALID', `Invalid project GID: ${projectGid}`);
  }

  return {
    taskGid,
    projectGid: projectGid === '0' ? null : projectGid,
    workspaceGid: null,
  };
}

module.exports = {
  parseAsanaUrl,
};
