'use strict';

const { parseArgs, readData, outputJson, outputError } = require('./cli');
const { parseAccounts, resolveAccount } = require('./accounts');
const { requireAsanaSDK } = require('./deps');
const { createClient } = require('./client');
const { SkillError } = require('./errors');
const {
  invalid, requireString, gid, taskTarget, bool, csvGids, mergePayload, validateTaskPayload,
  validateProjectPayload, choosePosition,
} = require('./validation');
const operations = require('./operations');

const COMMON = ['account', 'help'];
const WRITE_COMMON = [...COMMON, 'dryRun'];
const DATA_COMMON = [...WRITE_COMMON, 'dataJson', 'dataFile'];

const HELP = {
  'list-accounts': 'Usage: node scripts/list-accounts.js',
  'verify-access': 'Usage: node scripts/verify-access.js [--account NAME]',
  'list-workspaces': 'Usage: node scripts/list-workspaces.js [--account NAME]',
  'list-teams': 'Usage: node scripts/list-teams.js --workspace GID [--account NAME]',
  'list-projects': 'Usage: node scripts/list-projects.js --workspace GID [--account NAME]',
  'list-sections': 'Usage: node scripts/list-sections.js --project GID [--account NAME]',
  'list-users': 'Usage: node scripts/list-users.js --workspace GID [--query TEXT] [--account NAME]',
  'list-tags': 'Usage: node scripts/list-tags.js --workspace GID [--account NAME]',
  'list-custom-fields': 'Usage: node scripts/list-custom-fields.js --project GID [--account NAME]',
  'create-project': 'Usage: node scripts/create-project.js --workspace GID --name NAME [--team GID] [--notes TEXT] [--owner GID|me] [--start-on DATE] [--due-on DATE] [--public BOOL] [--data-json JSON|--data-file PATH] [--allow-duplicate] [--dry-run] [--account NAME]',
  'update-project': 'Usage: node scripts/update-project.js --project GID [--name NAME] [--notes TEXT] [--owner GID|me] [--start-on DATE] [--due-on DATE] [--public BOOL] [--data-json JSON|--data-file PATH] [--dry-run] [--account NAME]',
  'create-section': 'Usage: node scripts/create-section.js --project GID --name NAME [--allow-duplicate] [--dry-run] [--account NAME]',
  'update-section': 'Usage: node scripts/update-section.js --section GID --name NAME [--dry-run] [--account NAME]',
  'move-section': 'Usage: node scripts/move-section.js --project GID --section GID (--before GID|--after GID) [--dry-run] [--account NAME]',
  'create-task': 'Usage: node scripts/create-task.js (--project GID|--parent GID|--workspace GID) --name NAME [--section GID] [--assignee GID|me] [--due-on DATE|--due-at ISO] [--start-on DATE|--start-at ISO] [--data-json JSON|--data-file PATH] [--allow-duplicate] [--dry-run] [--account NAME]',
  'update-task': 'Usage: node scripts/update-task.js (--id GID|--url URL) [task fields] [--complete|--reopen] [--unassign] [--clear-due] [--clear-start] [--data-json JSON|--data-file PATH] [--dry-run] [--account NAME]',
  'move-task': 'Usage: node scripts/move-task.js (--id GID|--url URL) --project GID [--section GID] [--before GID|--after GID|--at-start|--at-end] [--dry-run] [--account NAME]',
  'set-task-tags': 'Usage: node scripts/set-task-tags.js (--id GID|--url URL) [--add GID,GID] [--remove GID,GID] [--dry-run] [--account NAME]',
  'set-task-dependencies': 'Usage: node scripts/set-task-dependencies.js (--id GID|--url URL) [--add GID,GID] [--remove GID,GID] [--dry-run] [--account NAME]',
  'add-comment': 'Usage: node scripts/add-comment.js (--id GID|--url URL) (--text TEXT|--html-text HTML) [--dry-run] [--account NAME]',
};

const PROJECT_CREATE_FIELDS = ['name', 'notes', 'html_notes', 'color', 'public', 'start_on', 'due_on', 'owner', 'team'];
const PROJECT_UPDATE_FIELDS = PROJECT_CREATE_FIELDS.filter((field) => field !== 'team');
const TASK_FIELDS = ['name', 'notes', 'html_notes', 'assignee', 'followers', 'due_on', 'due_at', 'start_on', 'start_at', 'completed', 'resource_subtype', 'custom_fields'];

function ensureOptions(args, allowed) {
  const unexpected = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unexpected.length) invalid(`Unsupported option(s): ${unexpected.map((key) => `--${key}`).join(', ')}`);
}

function flag(value, label) {
  return value === undefined ? false : bool(value, label);
}

function projectPayload(args, { create }) {
  const data = readData(args);
  const payload = mergePayload(data, [
    ['name', args.name], ['notes', args.notes], ['html_notes', args.htmlNotes], ['color', args.color],
    ['public', args.public], ['start_on', args.startOn], ['due_on', args.dueOn], ['owner', args.owner],
    ['team', args.team],
  ], create ? PROJECT_CREATE_FIELDS : PROJECT_UPDATE_FIELDS);
  if (!create && Object.prototype.hasOwnProperty.call(payload, 'team')) invalid('team cannot be changed by update-project');
  validateProjectPayload(payload, { create });
  if (!create && !Object.keys(payload).length) invalid('At least one project field must be supplied');
  return payload;
}

function taskPayload(args, { create }) {
  const data = readData(args);
  const complete = flag(args.complete, '--complete');
  const reopen = flag(args.reopen, '--reopen');
  const unassign = flag(args.unassign, '--unassign');
  const clearDue = flag(args.clearDue, '--clear-due');
  const clearStart = flag(args.clearStart, '--clear-start');
  if (complete && reopen) invalid('--complete and --reopen are mutually exclusive');
  if (unassign && args.assignee !== undefined) invalid('--unassign and --assignee are mutually exclusive');
  if (clearDue && (args.dueOn !== undefined || args.dueAt !== undefined || data.due_on !== undefined || data.due_at !== undefined)) invalid('--clear-due conflicts with supplied due fields');
  if (clearStart && (args.startOn !== undefined || args.startAt !== undefined || data.start_on !== undefined || data.start_at !== undefined)) invalid('--clear-start conflicts with supplied start fields');
  if ((complete || reopen) && data.completed !== undefined) invalid('completed was supplied both as a flag and in data');
  if (unassign && data.assignee !== undefined) invalid('assignee was supplied both as --unassign and in data');
  const scalar = [
    ['name', args.name], ['notes', args.notes], ['html_notes', args.htmlNotes], ['assignee', args.assignee],
    ['due_on', args.dueOn], ['due_at', args.dueAt], ['start_on', args.startOn], ['start_at', args.startAt],
    ['resource_subtype', args.resourceSubtype],
  ];
  if (complete) scalar.push(['completed', true]);
  if (reopen) scalar.push(['completed', false]);
  if (unassign) scalar.push(['assignee', null]);
  if (clearDue) scalar.push(['due_on', null], ['due_at', null]);
  if (clearStart) scalar.push(['start_on', null], ['start_at', null]);
  const payload = mergePayload(data, scalar, TASK_FIELDS);
  validateTaskPayload(payload, { create });
  if (!create && !Object.keys(payload).length) invalid('At least one task field or clearing flag must be supplied');
  return payload;
}

function relationshipLists(args, taskGid) {
  const add = csvGids(args.add, '--add');
  const remove = csvGids(args.remove, '--remove');
  if (!add.length && !remove.length) invalid('Pass at least one GID through --add or --remove');
  const overlap = add.filter((value) => remove.includes(value));
  if (overlap.length) invalid(`The same GID cannot be added and removed: ${overlap.join(', ')}`);
  if (add.includes(taskGid)) invalid('A task cannot depend on or tag itself using its task GID');
  return { add, remove };
}

async function execute(command, argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (!HELP[command]) throw new SkillError('ASANA_ARGUMENT_INVALID', `Unknown command: ${command}`);
  if (args.help) return { help: HELP[command] };

  const accounts = parseAccounts((dependencies.env || process.env).ASANA_ACCOUNTS);
  if (command === 'list-accounts') {
    ensureOptions(args, COMMON);
    return { metadata: { timestamp: new Date().toISOString() }, accounts: [...accounts.keys()] };
  }

  const account = resolveAccount(accounts, args.account);
  const asana = dependencies.asana || requireAsanaSDK();
  const client = dependencies.client || createClient(asana, account.token);
  const context = { account: account.name, dryRun: flag(args.dryRun, '--dry-run'), client };

  switch (command) {
    case 'verify-access':
      ensureOptions(args, COMMON);
      return operations.verifyAccess(context);
    case 'list-workspaces':
      ensureOptions(args, COMMON);
      return operations.listWorkspaces(context);
    case 'list-teams':
      ensureOptions(args, [...COMMON, 'workspace']);
      return operations.listTeams(context, gid(args.workspace, '--workspace'));
    case 'list-projects':
      ensureOptions(args, [...COMMON, 'workspace']);
      return operations.listProjects(context, gid(args.workspace, '--workspace'));
    case 'list-sections':
      ensureOptions(args, [...COMMON, 'project']);
      return operations.listSections(context, gid(args.project, '--project'));
    case 'list-users':
      ensureOptions(args, [...COMMON, 'workspace', 'query']);
      return operations.listUsers(context, gid(args.workspace, '--workspace'), args.query ? requireString(args.query, '--query') : undefined);
    case 'list-tags':
      ensureOptions(args, [...COMMON, 'workspace']);
      return operations.listTags(context, gid(args.workspace, '--workspace'));
    case 'list-custom-fields':
      ensureOptions(args, [...COMMON, 'project']);
      return operations.listCustomFields(context, gid(args.project, '--project'));
    case 'create-project':
      ensureOptions(args, [...DATA_COMMON, 'workspace', 'name', 'notes', 'htmlNotes', 'color', 'public', 'startOn', 'dueOn', 'owner', 'team', 'allowDuplicate']);
      return operations.createProject(context, {
        workspaceGid: gid(args.workspace, '--workspace'), payload: projectPayload(args, { create: true }), allowDuplicate: flag(args.allowDuplicate, '--allow-duplicate'),
      });
    case 'update-project':
      ensureOptions(args, [...DATA_COMMON, 'project', 'name', 'notes', 'htmlNotes', 'color', 'public', 'startOn', 'dueOn', 'owner']);
      return operations.updateProject(context, { projectGid: gid(args.project, '--project'), payload: projectPayload(args, { create: false }) });
    case 'create-section':
      ensureOptions(args, [...WRITE_COMMON, 'project', 'name', 'allowDuplicate']);
      return operations.createSection(context, { projectGid: gid(args.project, '--project'), name: requireString(args.name, '--name'), allowDuplicate: flag(args.allowDuplicate, '--allow-duplicate') });
    case 'update-section':
      ensureOptions(args, [...WRITE_COMMON, 'section', 'name']);
      return operations.updateSection(context, { sectionGid: gid(args.section, '--section'), name: requireString(args.name, '--name') });
    case 'move-section': {
      ensureOptions(args, [...WRITE_COMMON, 'project', 'section', 'before', 'after']);
      if (Boolean(args.before) === Boolean(args.after)) invalid('Pass exactly one of --before or --after');
      return operations.moveSection(context, {
        projectGid: gid(args.project, '--project'), sectionGid: gid(args.section, '--section'), position: choosePosition(args),
      });
    }
    case 'create-task': {
      ensureOptions(args, [...DATA_COMMON, 'project', 'section', 'parent', 'workspace', 'name', 'notes', 'htmlNotes', 'assignee', 'dueOn', 'dueAt', 'startOn', 'startAt', 'resourceSubtype', 'allowDuplicate']);
      const locations = ['project', 'parent', 'workspace'].filter((key) => args[key] !== undefined);
      if (locations.length !== 1) invalid('Pass exactly one of --project, --parent, or --workspace');
      if (args.section && !args.project) invalid('--section requires --project');
      return operations.createTask(context, {
        projectGid: args.project ? gid(args.project, '--project') : undefined,
        sectionGid: args.section ? gid(args.section, '--section') : undefined,
        parentGid: args.parent ? gid(args.parent, '--parent') : undefined,
        workspaceGid: args.workspace ? gid(args.workspace, '--workspace') : undefined,
        payload: taskPayload(args, { create: true }), allowDuplicate: flag(args.allowDuplicate, '--allow-duplicate'),
      });
    }
    case 'update-task':
      ensureOptions(args, [...DATA_COMMON, 'id', 'url', 'name', 'notes', 'htmlNotes', 'assignee', 'dueOn', 'dueAt', 'startOn', 'startAt', 'resourceSubtype', 'complete', 'reopen', 'unassign', 'clearDue', 'clearStart']);
      return operations.updateTask(context, { taskGid: taskTarget(args), payload: taskPayload(args, { create: false }) });
    case 'move-task':
      ensureOptions(args, [...WRITE_COMMON, 'id', 'url', 'project', 'section', 'before', 'after', 'atStart', 'atEnd']);
      return operations.moveTask(context, {
        taskGid: taskTarget(args), projectGid: gid(args.project, '--project'), sectionGid: args.section ? gid(args.section, '--section') : undefined, position: choosePosition(args),
      });
    case 'set-task-tags': {
      ensureOptions(args, [...WRITE_COMMON, 'id', 'url', 'add', 'remove']);
      const taskGid = taskTarget(args);
      return operations.setTaskTags(context, { taskGid, ...relationshipLists(args) });
    }
    case 'set-task-dependencies': {
      ensureOptions(args, [...WRITE_COMMON, 'id', 'url', 'add', 'remove']);
      const taskGid = taskTarget(args);
      return operations.setTaskDependencies(context, { taskGid, ...relationshipLists(args, taskGid) });
    }
    case 'add-comment': {
      ensureOptions(args, [...WRITE_COMMON, 'id', 'url', 'text', 'htmlText']);
      if (Boolean(args.text) === Boolean(args.htmlText)) invalid('Pass exactly one of --text or --html-text');
      const data = args.text ? { text: requireString(args.text, '--text') } : { html_text: requireString(args.htmlText, '--html-text') };
      return operations.addComment(context, { taskGid: taskTarget(args), data });
    }
    default:
      throw new SkillError('ASANA_ARGUMENT_INVALID', `Unknown command: ${command}`);
  }
}

async function run(command) {
  try {
    const result = await execute(command);
    if (result.help) process.stdout.write(`${result.help}\n`);
    else outputJson(result);
  } catch (error) {
    outputError(error);
  }
}

module.exports = { HELP, execute, run, projectPayload, taskPayload };
