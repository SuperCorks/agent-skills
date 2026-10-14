#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveCredential, storeCredential, validateAlias, validateKey, KEYCHAIN_SERVICE } from './auth.mjs';
import { createClient } from './client.mjs';
import { USER_QUERY, isoDate, listMeetings, readMeeting, selectSentences, renderMeeting } from './meetings.mjs';

const HELP = `Fireflies API-key CLI (Node.js 20+, no npm dependencies)

  verify                              Verify the credential and account identity
  auth store --stdin                  Verify and store a key in macOS Keychain
  list                                List accessible meetings
  search <keyword>                    Search titles and/or spoken transcript text
  transcript <id-or-url>               Read a transcript with speakers and times
  summary <id-or-url>                  Read the summary and action items
  action-items <id-or-url>             Read generated action items

Common:
  --account <alias>                    Keychain alias (default: default)
  --expect-email <email>               Require the key owner to match this email
  --format json|text|markdown          Output format (default: json)
  --output <path>                      Write a new file with mode 0600

List/search:
  --from <date> --to <date>             UTC calendar dates or timezone-qualified ISO timestamps
  --participant <email>                Attendee filter; repeat for multiple emails
  --organizer <email>                  Organizer filter; repeat for multiple emails
  --mine                              Only meetings organized by the key owner
  --channel <id>                       Channel filter
  --limit <1..50> --skip <number>       One page (default: 20 meetings, skip 0)
  --all --max-pages <1..100>            Fetch pages of 50 (default: at most 20 pages)
  --scope title|sentences|all           Search scope (search default: all)

Transcript:
  --contains <text> --speaker <name>   Select literal text / speaker name matches
  --start <seconds> --end <seconds>    Select sentences overlapping this interval

Store keys through stdin, never command arguments. Default auth resolves
FIREFLIES_API_KEY first, then macOS Keychain service '${KEYCHAIN_SERVICE}'.
Named --account aliases use Keychain only. No MCP server is required.
`;

const options = {
  help: { type: 'boolean', short: 'h' },
  account: { type: 'string' }, 'expect-email': { type: 'string' },
  format: { type: 'string' }, output: { type: 'string' },
  stdin: { type: 'boolean' },
  from: { type: 'string' }, to: { type: 'string' },
  participant: { type: 'string', multiple: true }, organizer: { type: 'string', multiple: true },
  mine: { type: 'boolean' }, channel: { type: 'string' },
  limit: { type: 'string' }, skip: { type: 'string' },
  all: { type: 'boolean' }, 'max-pages': { type: 'string' }, scope: { type: 'string' },
  contains: { type: 'string' }, speaker: { type: 'string' },
  start: { type: 'string' }, end: { type: 'string' },
};
const common = ['help', 'account', 'expect-email', 'format', 'output'];
const listOptions = ['from', 'to', 'participant', 'organizer', 'mine', 'channel', 'limit', 'skip', 'all', 'max-pages'];
const allowed = {
  verify: common,
  auth: [...common, 'stdin'],
  list: [...common, ...listOptions],
  search: [...common, ...listOptions, 'scope'],
  transcript: [...common, 'contains', 'speaker', 'start', 'end'],
  summary: common,
  'action-items': common,
};

function number(value, name, { min = 0, max = Infinity, integer = false } = {}) {
  if (value.trim() === '') throw new Error(`--${name} requires a number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return parsed;
}

function emails(values, name) {
  if (values?.some(value => value.length > 256 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    throw new Error(`--${name} requires valid email addresses.`);
  }
  return values;
}

export function parseCommand(args) {
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
  const [command, argument, ...extra] = positionals;
  if (values.help || !command) return { help: true };
  if (!allowed[command]) throw new Error(`Unknown command '${command}'. Use --help.`);
  for (const option of Object.keys(values)) {
    if (!allowed[command].includes(option)) throw new Error(`--${option} is not supported by ${command}.`);
  }
  if (extra.length) throw new Error('Too many positional arguments.');
  const needsArgument = ['search', 'transcript', 'summary', 'action-items', 'auth'].includes(command);
  if (needsArgument && !argument) throw new Error(`${command} requires ${command === 'auth' ? "'store'" : 'an argument'}.`);
  if (!needsArgument && argument) throw new Error(`${command} takes no positional argument.`);
  if (command === 'auth' && (argument !== 'store' || !values.stdin)) throw new Error('Use auth store --stdin.');
  const alias = validateAlias(values.account ?? 'default');
  const format = values.format ?? 'json';
  if (!['json', 'text', 'markdown'].includes(format)) throw new Error('Use --format json, text, or markdown.');
  const filters = {};
  if (values.from) filters.fromDate = isoDate(values.from);
  if (values.to) filters.toDate = isoDate(values.to, true);
  if (filters.fromDate && filters.toDate && filters.fromDate >= filters.toDate) throw new Error('--from must be earlier than --to.');
  if (values.participant) filters.participants = emails(values.participant, 'participant');
  if (values.organizer) filters.organizers = emails(values.organizer, 'organizer');
  if (values.mine) filters.mine = true;
  if (values.channel) {
    if (values.channel.length > 256) throw new Error('--channel must be at most 256 characters.');
    filters.channelId = values.channel;
  }
  if (command === 'search') {
    if (!argument.trim() || argument.length > 255) throw new Error('Search keywords must be 1–255 characters.');
    filters.keyword = argument;
    filters.scope = values.scope ?? 'all';
    if (!['title', 'sentences', 'all'].includes(filters.scope)) throw new Error('--scope must be title, sentences, or all.');
  }
  if (values.all && values.limit) throw new Error('--all uses pages of 50; omit --limit.');
  if (values['max-pages'] && !values.all) throw new Error('--max-pages requires --all.');
  const pagination = {
    limit: values.limit === undefined ? 20 : number(values.limit, 'limit', { min: 1, max: 50, integer: true }),
    skip: values.skip === undefined ? 0 : number(values.skip, 'skip', { integer: true }),
    all: values.all ?? false,
    maxPages: values['max-pages'] === undefined ? 20 : number(values['max-pages'], 'max-pages', { min: 1, max: 100, integer: true }),
  };
  const selection = {
    contains: values.contains,
    speaker: values.speaker,
    start: values.start === undefined ? undefined : number(values.start, 'start'),
    end: values.end === undefined ? undefined : number(values.end, 'end'),
  };
  if (selection.start !== undefined && selection.end !== undefined && selection.start > selection.end) {
    throw new Error('--start must not exceed --end.');
  }
  if (values['expect-email']) emails([values['expect-email']], 'expect-email');
  return { command, argument, alias, format, output: values.output, expectEmail: values['expect-email'], filters, pagination, selection };
}

async function verifyUser(query, expected) {
  const data = await query(USER_QUERY);
  if (!data.user?.email) throw new Error('Fireflies did not return an account identity.');
  if (expected && data.user.email.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Credential belongs to '${data.user.email}', not the expected account '${expected}'.`);
  }
  return data.user;
}

async function readStdin() {
  if (process.stdin.isTTY) throw new Error('Pipe the API key through stdin; do not type it into an echoed terminal.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 8192) throw new Error('API key input is unexpectedly large.');
  }
  return validateKey(input);
}

function render(result, config) {
  if (config.format === 'json') return JSON.stringify(result, null, 2) + '\n';
  if (['transcript', 'summary', 'action-items'].includes(config.command)) {
    return renderMeeting(result, { mode: config.command, format: config.format });
  }
  if (result.meetings) {
    return result.meetings.map(meeting =>
      `${meeting.date_iso ?? 'Unknown date'} | ${meeting.title ?? 'Untitled'} | ${meeting.id}\n${meeting.transcript_url}`)
      .join('\n\n') + `\n\nPagination: ${JSON.stringify(result.pagination)}\n`;
  }
  return JSON.stringify(result, null, 2) + '\n';
}

export async function main(args = process.argv.slice(2)) {
  const config = parseCommand(args);
  if (config.help) { process.stdout.write(HELP); return; }
  let result;
  if (config.command === 'auth') {
    const key = await readStdin();
    const user = await verifyUser(createClient(key), config.expectEmail);
    storeCredential(key, config.alias);
    result = { stored: true, account: config.alias, source: 'macOS Keychain', service: KEYCHAIN_SERVICE, user };
  } else {
    const credential = resolveCredential(config.alias);
    const query = createClient(credential.key);
    if (config.command === 'verify') {
      result = { account: credential.alias, source: credential.source, user: await verifyUser(query, config.expectEmail) };
    } else {
      if (config.expectEmail) await verifyUser(query, config.expectEmail);
      if (['list', 'search'].includes(config.command)) {
        result = await listMeetings(query, { filters: config.filters, ...config.pagination });
      } else {
        result = await readMeeting(query, config.argument, config.command);
        if (config.command === 'transcript') {
          const filtered = Object.values(config.selection).some(value => value !== undefined);
          if (filtered) {
            result = { ...result, sentences: selectSentences(result, config.selection), selection: config.selection };
          }
        }
        if (config.command === 'action-items') {
          result = { id: result.id, title: result.title, date_iso: result.date_iso,
            transcript_url: result.transcript_url, duration_minutes: result.duration_minutes,
            meeting_info: result.meeting_info, summary: { action_items: result.summary?.action_items ?? null } };
        }
      }
    }
  }
  const content = render(result, config);
  if (config.output) {
    await writeFile(config.output, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({ written: config.output, format: config.format }) + '\n');
  } else {
    process.stdout.write(content);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ error: {
      message: error.message,
      ...(error.codes?.length ? { codes: error.codes } : {}),
      ...(error.status != null ? { status: error.status } : {}),
      ...(error.retryAfterSeconds != null ? { retry_after_seconds: error.retryAfterSeconds } : {}),
    } }) + '\n');
    process.exitCode = 1;
  });
}
