/**
 * Transform Asana API responses to normalized schema
 */

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Normalize a task
 * 
 * @param {Object} rawTask - Raw Asana task object
 * @returns {Object} Normalized task
 */
function normalizeTask(rawTask) {
  return {
    gid: rawTask.gid,
    name: rawTask.name,
    notes: rawTask.notes || '',
    notesPlainText: stripHtml(rawTask.notes),
    completed: rawTask.completed || false,
    completedAt: rawTask.completed_at || null,
    dueOn: rawTask.due_on || null,
    dueAt: rawTask.due_at || null,
    startOn: rawTask.start_on || null,
    startAt: rawTask.start_at || null,
    assignee: rawTask.assignee ? {
      gid: rawTask.assignee.gid,
      name: rawTask.assignee.name,
    } : null,
    projects: (rawTask.projects || []).map(p => ({
      gid: p.gid,
      name: p.name,
    })),
    tags: (rawTask.tags || []).map(t => ({
      gid: t.gid,
      name: t.name,
    })),
    parent: rawTask.parent ? {
      gid: rawTask.parent.gid,
      name: rawTask.parent.name,
    } : null,
    numSubtasks: rawTask.num_subtasks || 0,
    createdAt: rawTask.created_at,
    modifiedAt: rawTask.modified_at,
    permalinkUrl: rawTask.permalink_url,
    customFields: (rawTask.custom_fields || []).map(cf => ({
      gid: cf.gid,
      name: cf.name,
      type: cf.type,
      displayValue: cf.display_value,
    })),
  };
}

/**
 * Normalize a comment/story
 * 
 * @param {Object} rawStory - Raw Asana story object
 * @returns {Object} Normalized comment
 */
function normalizeComment(rawStory) {
  return {
    gid: rawStory.gid,
    text: rawStory.text || '',
    textPlainText: stripHtml(rawStory.text),
    createdAt: rawStory.created_at,
    createdBy: rawStory.created_by ? {
      gid: rawStory.created_by.gid,
      name: rawStory.created_by.name,
    } : null,
  };
}

/**
 * Normalize full output
 * 
 * @param {Object} task - Raw Asana task object
 * @param {Object[]} comments - Array of raw comment/story objects
 * @param {string} accountName - Account name used
 * @returns {Object} Full normalized output
 */
function normalizeOutput(task, comments, accountName) {
  return {
    metadata: {
      fetchedAt: new Date().toISOString(),
      account: accountName,
    },
    task: normalizeTask(task),
    comments: comments.map(normalizeComment),
  };
}

module.exports = {
  normalizeTask,
  normalizeComment,
  normalizeOutput,
  stripHtml,
};
