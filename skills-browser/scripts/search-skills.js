#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCES_PATH = path.resolve(__dirname, '..', 'sources.json');
const SKILL_FILE_PATTERN = /(^|\/)SKILL\.md$/i;
const DEFAULT_LIMIT = 15;

const TRUST_WEIGHTS = {
  high: 8,
  'medium-high': 6,
  medium: 4,
  'low-filtered': 1,
};

const QUERY_ALIASES = {
  ios: ['swift', 'swiftui', 'xcode', 'iphone', 'ipad', 'mobile'],
  iphone: ['ios', 'swift', 'swiftui', 'xcode'],
  mobile: ['ios', 'android', 'react-native', 'react native', 'expo', 'flutter', 'swift', 'kotlin'],
  'react-native': ['react native', 'expo', 'mobile', 'ios', 'android'],
  'react native': ['react-native', 'expo', 'mobile', 'ios', 'android'],
  expo: ['react-native', 'react native', 'mobile', 'ios', 'android'],
  frontend: ['react', 'vue', 'angular', 'css', 'ui', 'web'],
  qa: ['test', 'testing', 'playwright', 'browser', 'e2e'],
  testing: ['test', 'qa', 'playwright', 'jest', 'pytest', 'e2e'],
  security: ['appsec', 'threat', 'vulnerability', 'secure', 'privacy'],
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    limit: DEFAULT_LIMIT,
    maxRepos: Infinity,
    maxContentPerRepo: null,
    includeLowTrust: false,
    deep: false,
    json: false,
  };
  const queryParts = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--include-low-trust') {
      args.includeLowTrust = true;
      continue;
    }

    if (arg === '--deep') {
      args.deep = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      index++;
      setArg(args, key, value);
      continue;
    }

    queryParts.push(arg);
  }

  args.query = queryParts.join(' ').trim();
  return args;
}

function setArg(args, key, value) {
  switch (key) {
    case 'query':
      args.query = value;
      break;
    case 'source-file':
      args.sourceFile = value;
      break;
    case 'repo':
      args.repo = value;
      break;
    case 'limit':
      args.limit = parsePositiveInteger(value, '--limit');
      break;
    case 'max-repos':
      args.maxRepos = parsePositiveInteger(value, '--max-repos');
      break;
    case 'max-content-per-repo':
      args.maxContentPerRepo = parsePositiveInteger(value, '--max-content-per-repo');
      break;
    default:
      throw new Error(`Unknown option --${key}`);
  }
}

function parsePositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Search curated public Agent Skills repositories for matching SKILL.md files.

Usage:
  node scripts/search-skills.js "ios app skills" [options]
  node scripts/search-skills.js --query "security threat modeling" --json

Options:
  --query <text>                 Query text. You can also pass it positionally.
  --repo <owner/name>            Restrict search to one repository.
  --source-file <path>           Use a custom source registry JSON file.
  --limit <n>                    Number of results to show. Default: ${DEFAULT_LIMIT}.
  --max-repos <n>                Search only the first N configured repos.
  --max-content-per-repo <n>     Override per-repo content scan budget.
  --include-low-trust            Include low-filtered aggregator repos.
  --deep                         Scan more SKILL.md bodies in large repos.
  --json                         Output machine-readable JSON.
  --help                         Show this help.

Environment:
  GITHUB_TOKEN                   Optional token for higher GitHub API limits.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.query) {
    throw new Error('Provide a query, for example: node scripts/search-skills.js "ios app"');
  }

  const sources = loadSources(args.sourceFile || DEFAULT_SOURCES_PATH, args);
  const query = buildQuery(args.query);
  const searchedAt = new Date().toISOString();
  const sourceResults = [];

  for (const source of sources.slice(0, args.maxRepos)) {
    sourceResults.push(await searchSource(source, query, args));
  }

  const results = sourceResults
    .flatMap(sourceResult => sourceResult.results)
    .sort(compareResults)
    .slice(0, args.limit);

  const payload = {
    metadata: {
      searchedAt,
      query: args.query,
      expandedTerms: query.terms,
      sourceCount: sources.length,
      resultCount: results.length,
    },
    results,
    sources: sourceResults.map(({ results: _results, ...source }) => source),
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printHuman(payload);
  }
}

function loadSources(sourcePath, args) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  let sources = JSON.parse(raw);

  if (args.repo) {
    sources = sources.filter(source => source.repo.toLowerCase() === args.repo.toLowerCase());
    if (sources.length === 0) {
      sources = [{ repo: args.repo, trust: 'medium', sourceType: 'custom', bestFor: [], notes: 'Ad hoc repository from --repo' }];
    }
  }

  if (!args.includeLowTrust) {
    sources = sources.filter(source => source.trust !== 'low-filtered');
  }

  return sources;
}

function buildQuery(input) {
  const baseTerms = tokenize(input);
  const expanded = new Set(baseTerms);

  for (const term of baseTerms) {
    const aliases = QUERY_ALIASES[term] || [];
    aliases.forEach(alias => expanded.add(alias));
  }

  return {
    raw: input,
    terms: [...expanded].filter(term => term.length > 1),
  };
}

async function searchSource(source, query, args) {
  const sourceStartedAt = Date.now();
  try {
    const metadata = await githubJson(`https://api.github.com/repos/${source.repo}`);
    const branch = metadata.default_branch;
    const tree = await githubJson(`https://api.github.com/repos/${source.repo}/git/trees/${branch}?recursive=1`);
    const skillPaths = (tree.tree || [])
      .filter(item => item.type === 'blob' && SKILL_FILE_PATTERN.test(item.path))
      .map(item => item.path)
      .filter(path => !/template/i.test(path));

    const pathMatches = skillPaths.filter(skillPath => scorePath(skillPath, query) > 0);
    const scanBudget = getScanBudget(source, args, skillPaths.length);
    const pathsToInspect = unique([...pathMatches, ...skillPaths.slice(0, scanBudget)]);
    const results = [];

    for (const skillPath of pathsToInspect) {
      const content = await fetchRawSkill(source.repo, branch, skillPath);
      const candidate = buildCandidate(source, metadata, branch, skillPath, content, query);
      if (candidate.score > 0) {
        results.push(candidate);
      }
    }

    return {
      repo: source.repo,
      trust: source.trust || 'medium',
      sourceType: source.sourceType || 'unknown',
      skillCount: skillPaths.length,
      inspectedCount: pathsToInspect.length,
      resultCount: results.length,
      durationMs: Date.now() - sourceStartedAt,
      error: null,
      results,
    };
  } catch (error) {
    return {
      repo: source.repo,
      trust: source.trust || 'medium',
      sourceType: source.sourceType || 'unknown',
      skillCount: 0,
      inspectedCount: 0,
      resultCount: 0,
      durationMs: Date.now() - sourceStartedAt,
      error: error.message,
      results: [],
    };
  }
}

function getScanBudget(source, args, skillCount) {
  if (args.maxContentPerRepo) {
    return Math.min(skillCount, args.maxContentPerRepo);
  }

  const configured = Number.isFinite(source.maxContentScan) ? source.maxContentScan : 80;
  const deepMultiplier = args.deep ? 3 : 1;
  return Math.min(skillCount, configured * deepMultiplier);
}

async function githubJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function fetchRawSkill(repo, branch, skillPath) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${skillPath}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'skills-browser' } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'skills-browser',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function buildCandidate(source, repoMetadata, branch, skillPath, content, query) {
  const frontmatter = parseFrontmatter(content);
  const skillName = frontmatter.name || inferSkillName(skillPath);
  const description = frontmatter.description || '';
  const lowerPath = skillPath.toLowerCase();
  const lowerName = skillName.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const lowerContent = content.slice(0, 6000).toLowerCase();
  let score = TRUST_WEIGHTS[source.trust] || 3;
  const matchedTerms = new Set();
  const reasons = [];
  let strongMatchCount = 0;

  for (const term of query.terms) {
    const lowerTerm = term.toLowerCase();
    if (includesTerm(lowerName, lowerTerm)) {
      score += 12;
      strongMatchCount++;
      matchedTerms.add(term);
      reasons.push(`name matches "${term}"`);
    }
    if (includesTerm(lowerPath.replace(/[\/_]/g, '-'), lowerTerm)) {
      score += 9;
      strongMatchCount++;
      matchedTerms.add(term);
      reasons.push(`path matches "${term}"`);
    }
    if (includesTerm(lowerDescription, lowerTerm)) {
      score += 7;
      strongMatchCount++;
      matchedTerms.add(term);
      reasons.push(`description matches "${term}"`);
    }
    if (lowerTerm.length >= 4 && includesTerm(lowerContent, lowerTerm)) {
      score += 2;
      matchedTerms.add(term);
    }
  }

  for (const tag of source.bestFor || []) {
    if (strongMatchCount > 0 && query.terms.includes(tag.toLowerCase())) {
      score += 4;
      reasons.push(`source is strong for "${tag}"`);
    }
  }

  if (matchedTerms.size === 0 || strongMatchCount === 0) {
    score = 0;
  }

  return {
    score,
    matchedTerms: [...matchedTerms],
    reasons: unique(reasons).slice(0, 6),
    name: skillName,
    description: description ? compactWhitespace(description).slice(0, 500) : null,
    repo: source.repo,
    trust: source.trust || 'medium',
    path: skillPath,
    url: `https://github.com/${source.repo}/blob/${branch}/${skillPath}`,
    rawUrl: `https://raw.githubusercontent.com/${source.repo}/${branch}/${skillPath}`,
    sourceNotes: source.notes || null,
    repoStars: repoMetadata.stargazers_count,
  };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  return {
    name: parseYamlScalar(match[1], 'name'),
    description: parseYamlScalar(match[1], 'description'),
  };
}

function parseYamlScalar(frontmatter, key) {
  const quoted = frontmatter.match(new RegExp(`^${key}:\\s*['\"]([^'\"]+)['\"]\\s*$`, 'm'));
  if (quoted) {
    return quoted[1].trim();
  }

  const plain = frontmatter.match(new RegExp(`^${key}:\\s*([^\\n>|]+)`, 'm'));
  if (plain) {
    return plain[1].trim().replace(/^['\"]|['\"]$/g, '');
  }

  const block = frontmatter.match(new RegExp(`^${key}:\\s*[>|-]?[+-]?\\s*\\n((?:  .+\\n?)+)`, 'm'));
  if (block) {
    return compactWhitespace(block[1].replace(/^  /gm, ''));
  }

  return '';
}

function inferSkillName(skillPath) {
  const parts = skillPath.split('/');
  const parent = parts.length > 1 ? parts[parts.length - 2] : skillPath.replace(/\/SKILL\.md$/i, '');
  return parent.replace(/[-_]/g, ' ');
}

function scorePath(skillPath, query) {
  const lowerPath = skillPath.toLowerCase().replace(/[\/_]/g, '-');
  return query.terms.reduce((total, term) => {
    return total + (includesTerm(lowerPath, term.toLowerCase()) ? 1 : 0);
  }, 0);
}

function includesTerm(haystack, term) {
  const normalizedTerm = term.toLowerCase().replace(/\s+/g, '-');
  const normalizedHaystack = haystack.toLowerCase().replace(/\s+/g, '-');

  if (normalizedTerm.includes('-')) {
    return normalizedHaystack.includes(normalizedTerm);
  }

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`).test(normalizedHaystack);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareResults(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.repoStars !== left.repoStars) {
    return right.repoStars - left.repoStars;
  }
  return left.name.localeCompare(right.name);
}

function tokenize(input) {
  const normalized = input.toLowerCase().replace(/[^a-z0-9+#. -]+/g, ' ');
  const words = normalized.split(/[\s,]+/).map(word => word.trim()).filter(Boolean);
  const phrases = [];

  if (normalized.includes('react native')) {
    phrases.push('react native');
  }

  return unique([...words, ...phrases]);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function printHuman(payload) {
  console.log(`Skills Browser results for "${payload.metadata.query}"`);
  console.log(`Searched ${payload.metadata.sourceCount} source(s); found ${payload.metadata.resultCount} result(s).`);
  console.log(`Expanded terms: ${payload.metadata.expandedTerms.join(', ')}`);
  console.log('');

  for (const [index, result] of payload.results.entries()) {
    console.log(`${index + 1}. ${result.name} [${result.repo}]`);
    console.log(`   Score: ${result.score} | Trust: ${result.trust} | Matches: ${result.matchedTerms.join(', ')}`);
    console.log(`   Path: ${result.path}`);
    if (result.description) {
      console.log(`   ${result.description}`);
    }
    if (result.reasons.length > 0) {
      console.log(`   Why: ${result.reasons.join('; ')}`);
    }
    console.log(`   ${result.url}`);
    console.log('');
  }

  const errors = payload.sources.filter(source => source.error);
  if (errors.length > 0) {
    console.log('Source errors:');
    errors.forEach(source => console.log(`- ${source.repo}: ${source.error}`));
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    error: {
      code: 'SKILLS_BROWSER_ERROR',
      message: error.message,
    },
  }, null, 2));
  process.exit(1);
});