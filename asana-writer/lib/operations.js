'use strict';

const { SkillError } = require('./errors');
const { TASK_FIELDS, PROJECT_FIELDS, entity, collection, read, write, getTask, getProject, getSection } = require('./client');
const { changedPayload } = require('./validation');

function metadata(context) {
  return {
    timestamp: new Date().toISOString(),
    account: context.account,
    dryRun: Boolean(context.dryRun),
  };
}

function discovery(context, key, value) {
  return { metadata: metadata(context), [key]: value };
}

function mutation(context, operation, { before, requested, changed, result }) {
  const output = {
    metadata: metadata(context),
    operation,
    requested,
    changed,
    result,
  };
  if (before !== undefined) output.before = before;
  return output;
}

function duplicateError(kind, resource) {
  throw new SkillError('ASANA_DUPLICATE_FOUND', `${kind} ${resource.gid} is already named "${resource.name}"`);
}

async function listWorkspaces(context) {
  const values = await read('list-workspaces', () => collection(context.client.workspaces.getWorkspaces({
    opt_fields: 'gid,name,is_organization', limit: 100,
  })));
  return discovery(context, 'workspaces', values);
}

async function verifyAccess(context) {
  const [user, workspaces] = await Promise.all([
    read('verify-access', async () => entity(await context.client.users.getUser('me', { opt_fields: 'gid,name,email' }))),
    read('verify-access', () => collection(context.client.workspaces.getWorkspaces({ opt_fields: 'gid,name,is_organization', limit: 100 }))),
  ]);
  return { metadata: metadata(context), user, workspaces };
}

async function listTeams(context, workspaceGid) {
  const values = await read('list-teams', () => collection(context.client.teams.getTeamsForWorkspace(workspaceGid, {
    opt_fields: 'gid,name,description,html_description', limit: 100,
  })));
  return discovery(context, 'teams', values);
}

async function rawProjects(context, workspaceGid) {
  return read('list-projects', () => collection(context.client.projects.getProjectsForWorkspace(workspaceGid, {
    archived: false, opt_fields: PROJECT_FIELDS, limit: 100,
  })));
}

async function listProjects(context, workspaceGid) {
  return discovery(context, 'projects', await rawProjects(context, workspaceGid));
}

async function rawSections(context, projectGid) {
  return read('list-sections', () => collection(context.client.sections.getSectionsForProject(projectGid, {
    opt_fields: 'gid,name,project.gid,project.name,created_at', limit: 100,
  })));
}

async function listSections(context, projectGid) {
  return discovery(context, 'sections', await rawSections(context, projectGid));
}

async function listUsers(context, workspaceGid, query) {
  let values = await read('list-users', () => collection(context.client.users.getUsersForWorkspace(workspaceGid, {
    opt_fields: 'gid,name,email,resource_type', limit: 100,
  })));
  if (query) {
    const needle = query.toLowerCase();
    values = values.filter((user) => `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(needle));
  }
  return discovery(context, 'users', values);
}

async function listTags(context, workspaceGid) {
  const values = await read('list-tags', () => collection(context.client.tags.getTagsForWorkspace(workspaceGid, {
    opt_fields: 'gid,name,color,notes,permalink_url', limit: 100,
  })));
  return discovery(context, 'tags', values);
}

async function listCustomFields(context, projectGid) {
  const values = await read('list-custom-fields', () => collection(
    context.client.customFieldSettings.getCustomFieldSettingsForProject(projectGid, {
      opt_fields: [
        'gid', 'is_important', 'custom_field.gid', 'custom_field.name', 'custom_field.type',
        'custom_field.resource_subtype', 'custom_field.description', 'custom_field.enum_options.gid',
        'custom_field.enum_options.name', 'custom_field.enum_options.enabled',
      ].join(','),
      limit: 100,
    }),
  ));
  return discovery(context, 'customFieldSettings', values);
}

async function createProject(context, { workspaceGid, payload, allowDuplicate }) {
  const workspace = await read('create-project-preflight', async () => entity(await context.client.workspaces.getWorkspace(workspaceGid, {
    opt_fields: 'gid,name,is_organization',
  })));
  if (workspace.is_organization && !payload.team) {
    throw new SkillError('ASANA_ARGUMENT_INVALID', '--team is required when creating a project in an organization workspace');
  }
  const projects = await rawProjects(context, workspaceGid);
  const duplicate = projects.find((project) => project.name === payload.name);
  if (duplicate && !allowDuplicate) duplicateError('Project', duplicate);
  const requested = { workspace: workspaceGid, data: payload };
  if (context.dryRun) return mutation(context, 'create-project', { requested, changed: Object.keys(payload), result: null });
  const created = await write('create-project', async () => entity(await context.client.projects.createProjectForWorkspace({ data: payload }, workspaceGid, {
    opt_fields: PROJECT_FIELDS,
  })));
  const result = await getProject(context.client, created.gid);
  return mutation(context, 'create-project', { requested, changed: Object.keys(payload), result });
}

async function updateProject(context, { projectGid, payload }) {
  const before = await getProject(context.client, projectGid);
  const changes = changedPayload(before, payload);
  const requested = { project: projectGid, data: payload };
  if (!Object.keys(changes).length || context.dryRun) {
    const result = context.dryRun ? { ...before, ...changes } : before;
    return mutation(context, 'update-project', { before, requested, changed: Object.keys(changes), result });
  }
  await write('update-project', () => context.client.projects.updateProject({ data: changes }, projectGid, { opt_fields: PROJECT_FIELDS }));
  const result = await getProject(context.client, projectGid);
  return mutation(context, 'update-project', { before, requested, changed: Object.keys(changes), result });
}

async function createSection(context, { projectGid, name, allowDuplicate }) {
  await getProject(context.client, projectGid);
  const sections = await rawSections(context, projectGid);
  const duplicate = sections.find((section) => section.name === name);
  if (duplicate && !allowDuplicate) duplicateError('Section', duplicate);
  const requested = { project: projectGid, data: { name } };
  if (context.dryRun) return mutation(context, 'create-section', { requested, changed: ['name'], result: null });
  const created = await write('create-section', async () => entity(await context.client.sections.createSectionForProject(projectGid, {
    body: { data: { name } }, opt_fields: 'gid,name,project.gid,project.name,created_at',
  })));
  const result = await getSection(context.client, created.gid);
  return mutation(context, 'create-section', { requested, changed: ['name'], result });
}

async function updateSection(context, { sectionGid, name }) {
  const before = await getSection(context.client, sectionGid);
  const changes = before.name === name ? {} : { name };
  const requested = { section: sectionGid, data: { name } };
  if (!Object.keys(changes).length || context.dryRun) {
    return mutation(context, 'update-section', {
      before, requested, changed: Object.keys(changes), result: context.dryRun ? { ...before, ...changes } : before,
    });
  }
  await write('update-section', () => context.client.sections.updateSection(sectionGid, {
    body: { data: changes }, opt_fields: 'gid,name,project.gid,project.name,created_at',
  }));
  const result = await getSection(context.client, sectionGid);
  return mutation(context, 'update-section', { before, requested, changed: ['name'], result });
}

async function moveSection(context, { projectGid, sectionGid, position }) {
  const before = await getSection(context.client, sectionGid);
  await getProject(context.client, projectGid);
  const requested = { project: projectGid, data: { section: sectionGid, ...position } };
  if (context.dryRun) return mutation(context, 'move-section', { before, requested, changed: ['position'], result: before });
  await write('move-section', () => context.client.sections.insertSectionForProject(projectGid, {
    body: { data: { section: sectionGid, ...position } },
  }));
  const result = await getSection(context.client, sectionGid);
  return mutation(context, 'move-section', { before, requested, changed: ['position'], result });
}

async function tasksInDestination(context, { projectGid, sectionGid, parentGid }) {
  if (sectionGid) {
    return read('create-task-duplicate-check', () => collection(context.client.tasks.getTasksForSection(sectionGid, {
      completed_since: '1970-01-01T00:00:00.000Z', opt_fields: 'gid,name,permalink_url', limit: 100,
    })));
  }
  if (projectGid) {
    return read('create-task-duplicate-check', () => collection(context.client.tasks.getTasksForProject(projectGid, {
      completed_since: '1970-01-01T00:00:00.000Z', opt_fields: 'gid,name,permalink_url', limit: 100,
    })));
  }
  if (parentGid) {
    return read('create-task-duplicate-check', () => collection(context.client.tasks.getSubtasksForTask(parentGid, {
      opt_fields: 'gid,name,permalink_url', limit: 100,
    })));
  }
  return [];
}

async function createTask(context, { projectGid, sectionGid, parentGid, workspaceGid, payload, allowDuplicate }) {
  const existing = await tasksInDestination(context, { projectGid, sectionGid, parentGid });
  const duplicate = existing.find((task) => task.name === payload.name);
  if (duplicate && !allowDuplicate) duplicateError('Task', duplicate);
  const data = { ...payload };
  if (projectGid) data.projects = [projectGid];
  else if (workspaceGid) data.workspace = workspaceGid;
  const requested = { project: projectGid, section: sectionGid, parent: parentGid, workspace: workspaceGid, data };
  if (context.dryRun) return mutation(context, 'create-task', { requested, changed: Object.keys(data), result: null });
  let created;
  if (parentGid) {
    created = await write('create-subtask', async () => entity(await context.client.tasks.createSubtaskForTask({ data }, parentGid, {
      opt_fields: TASK_FIELDS,
    })));
  } else {
    created = await write('create-task', async () => entity(await context.client.tasks.createTask({ data }, { opt_fields: TASK_FIELDS })));
  }
  if (sectionGid) {
    await write('place-created-task', () => context.client.tasks.addProjectForTask({
      data: { project: projectGid, section: sectionGid },
    }, created.gid));
  }
  const result = await getTask(context.client, created.gid);
  return mutation(context, 'create-task', { requested, changed: Object.keys(data), result });
}

async function updateTask(context, { taskGid, payload }) {
  const before = await getTask(context.client, taskGid);
  const changes = changedPayload(before, payload);
  const requested = { task: taskGid, data: payload };
  if (!Object.keys(changes).length || context.dryRun) {
    return mutation(context, 'update-task', {
      before, requested, changed: Object.keys(changes), result: context.dryRun ? { ...before, ...changes } : before,
    });
  }
  await write('update-task', () => context.client.tasks.updateTask({ data: changes }, taskGid, { opt_fields: TASK_FIELDS }));
  const result = await getTask(context.client, taskGid);
  return mutation(context, 'update-task', { before, requested, changed: Object.keys(changes), result });
}

async function moveTask(context, { taskGid, projectGid, sectionGid, position }) {
  const before = await getTask(context.client, taskGid);
  await getProject(context.client, projectGid);
  if (sectionGid) await getSection(context.client, sectionGid);
  const data = { project: projectGid, ...position };
  if (sectionGid) data.section = sectionGid;
  const requested = { task: taskGid, data };
  if (context.dryRun) return mutation(context, 'move-task', { before, requested, changed: ['placement'], result: before });
  await write('move-task', () => context.client.tasks.addProjectForTask({ data }, taskGid));
  const result = await getTask(context.client, taskGid);
  return mutation(context, 'move-task', { before, requested, changed: ['placement'], result });
}

async function setTaskTags(context, { taskGid, add, remove }) {
  const before = await getTask(context.client, taskGid);
  const current = new Set((before.tags || []).map((tag) => tag.gid));
  const additions = add.filter((tag) => !current.has(tag));
  const removals = remove.filter((tag) => current.has(tag));
  const requested = { task: taskGid, add, remove };
  const changed = [...removals.map((gid) => `remove:${gid}`), ...additions.map((gid) => `add:${gid}`)];
  if (context.dryRun || !changed.length) return mutation(context, 'set-task-tags', { before, requested, changed, result: before });
  for (const tag of removals) await write('remove-task-tag', () => context.client.tasks.removeTagForTask({ data: { tag } }, taskGid));
  for (const tag of additions) await write('add-task-tag', () => context.client.tasks.addTagForTask({ data: { tag } }, taskGid));
  const result = await getTask(context.client, taskGid);
  return mutation(context, 'set-task-tags', { before, requested, changed, result });
}

async function setTaskDependencies(context, { taskGid, add, remove }) {
  const before = await getTask(context.client, taskGid);
  const [dependencies, dependents] = await Promise.all([
    read('list-task-dependencies', () => collection(context.client.tasks.getDependenciesForTask(taskGid, { opt_fields: 'gid,name', limit: 100 }))),
    read('list-task-dependents', () => collection(context.client.tasks.getDependentsForTask(taskGid, { opt_fields: 'gid,name', limit: 100 }))),
  ]);
  const current = new Set(dependencies.map((task) => task.gid));
  const additions = add.filter((gid) => !current.has(gid));
  const removals = remove.filter((gid) => current.has(gid));
  const finalDependencyCount = current.size - removals.length + additions.length;
  if (finalDependencyCount + dependents.length > 30) {
    throw new SkillError('ASANA_ARGUMENT_INVALID', 'The resulting dependencies and dependents would exceed Asana\'s combined limit of 30');
  }
  const requested = { task: taskGid, add, remove };
  const changed = [...removals.map((gid) => `remove:${gid}`), ...additions.map((gid) => `add:${gid}`)];
  if (context.dryRun || !changed.length) return mutation(context, 'set-task-dependencies', { before, requested, changed, result: before });
  if (removals.length) await write('remove-task-dependencies', () => context.client.tasks.removeDependenciesForTask({ data: { dependencies: removals } }, taskGid));
  if (additions.length) await write('add-task-dependencies', () => context.client.tasks.addDependenciesForTask({ data: { dependencies: additions } }, taskGid));
  const result = await getTask(context.client, taskGid);
  const finalDependencies = await read('verify-task-dependencies', () => collection(context.client.tasks.getDependenciesForTask(taskGid, {
    opt_fields: 'gid,name', limit: 100,
  })));
  result.dependencies = finalDependencies;
  return mutation(context, 'set-task-dependencies', { before, requested, changed, result });
}

async function addComment(context, { taskGid, data }) {
  const before = await getTask(context.client, taskGid);
  const requested = { task: taskGid, data };
  if (context.dryRun) return mutation(context, 'add-comment', { before, requested, changed: ['comment'], result: null });
  const created = await write('add-comment', async () => entity(await context.client.stories.createStoryForTask({ data }, taskGid, {
    opt_fields: 'gid,text,html_text,created_at,created_by.gid,created_by.name,type,resource_subtype',
  })));
  const result = await read('verify-comment', async () => entity(await context.client.stories.getStory(created.gid, {
    opt_fields: 'gid,text,html_text,created_at,created_by.gid,created_by.name,type,resource_subtype',
  })));
  return mutation(context, 'add-comment', { before, requested, changed: ['comment'], result });
}

module.exports = {
  metadata, listWorkspaces, verifyAccess, listTeams, listProjects, listSections, listUsers, listTags,
  listCustomFields, createProject, updateProject, createSection, updateSection, moveSection,
  createTask, updateTask, moveTask, setTaskTags, setTaskDependencies, addComment,
};
