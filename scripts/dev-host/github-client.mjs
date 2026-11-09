// Read-only GitHub REST client for the development-host controller (RO-034).
//
// Safety properties (pinned by safety.test.mjs):
// - Only HTTP GET exists. There is no code path that sends POST/PATCH/PUT/DELETE.
// - Only https://api.github.com and only an allowlist of read endpoints for one repository.
// - The optional token is sent as a header only; it never appears in errors, warnings or the report.
// - Redirects are refused, so a response cannot move the request to another host.
// - Lists are read completely (bounded pages, URLs built here, never taken from a response) or not at all:
//   a partial list could hide a round record, a finding or a failing check.
// No AI service is called: this talks to GitHub only (ADR 0005, $0 additional AI API spending).

const API_ORIGIN = 'https://api.github.com';
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

/** Read endpoints the controller may call, relative to /repos/<owner>/<repo>, each with an optional page. */
const ALLOWED = [
  /^\/pulls\?state=open&per_page=100(?:&page=[1-9][0-9]?)?$/,
  /^\/pulls\/[1-9][0-9]{0,8}\/reviews\?per_page=100(?:&page=[1-9][0-9]?)?$/,
  /^\/pulls\/[1-9][0-9]{0,8}\/comments\?per_page=100(?:&page=[1-9][0-9]?)?$/,
  /^\/issues\/[1-9][0-9]{0,8}\/comments\?per_page=100(?:&page=[1-9][0-9]?)?$/,
  /^\/commits\/[0-9a-f]{40}\/check-runs\?per_page=100(?:&page=[1-9][0-9]?)?$/,
  /^\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100(?:&page=[1-9][0-9]?)?$/,
];

/** Pages read per list before the data is declared incomplete (10 x 100 items). */
export const MAX_PAGES = 10;

/** Thrown when a list is longer than MAX_PAGES pages: the caller must not assess partial data. */
export class IncompleteDataError extends Error {
  constructor(path) {
    super(`${path} has more than ${MAX_PAGES * 100} items, so it was not assessed.`);
    this.incomplete = true;
  }
}

export function isAllowedPath(relativePath) {
  return ALLOWED.some((pattern) => pattern.test(relativePath));
}

function prNumber(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Expected a positive PR number.');
  return value;
}

/**
 * @param {{ repo: string, token?: string, fetchImpl?: typeof fetch }} options
 */
export function createGitHubClient({ repo, token, fetchImpl = globalThis.fetch }) {
  if (typeof repo !== 'string' || !REPO.test(repo)) {
    throw new Error('Expected the repository as <owner>/<name>.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available (Node 22 or later is required).');
  let calls = 0;

  async function get(relativePath) {
    if (!isAllowedPath(relativePath)) {
      throw new Error(`Refusing a GitHub path outside the read-only allowlist: ${relativePath}`);
    }
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dev-host-controller',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    calls += 1;
    const response = await fetchImpl(`${API_ORIGIN}/repos/${repo}${relativePath}`, {
      method: 'GET',
      headers,
      redirect: 'error',
    });
    if (!response.ok) {
      const hint = response.status === 403 || response.status === 429
        ? ' (rate limit? set a read-only token in DEV_HOST_GITHUB_TOKEN)'
        : '';
      throw new Error(`GitHub GET ${relativePath} failed: HTTP ${response.status}${hint}`);
    }
    const hasNext = /rel="next"/.test(response.headers?.get?.('link') ?? '');
    return { body: await response.json(), hasNext };
  }

  // Reads every page, building the next URL itself (page=2, 3, ...); it never follows a URL from a response.
  // Past MAX_PAGES it throws IncompleteDataError instead of returning a partial list.
  async function getAll(basePath, pick = (body) => body) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { body, hasNext } = await get(page === 1 ? basePath : `${basePath}&page=${page}`);
      const list = pick(body);
      if (!Array.isArray(list)) throw new Error(`GitHub GET ${basePath}: expected a list.`);
      items.push(...list);
      if (!hasNext) return items;
    }
    throw new IncompleteDataError(basePath);
  }

  return {
    get callCount() {
      return calls;
    },
    listOpenPulls: async () => getAll('/pulls?state=open&per_page=100'),
    listIssueComments: async (number) => getAll(`/issues/${prNumber(number)}/comments?per_page=100`),
    listReviews: async (number) => getAll(`/pulls/${prNumber(number)}/reviews?per_page=100`),
    listReviewComments: async (number) => getAll(`/pulls/${prNumber(number)}/comments?per_page=100`),
    async listCheckRuns(sha) {
      if (typeof sha !== 'string' || !SHA.test(sha)) throw new Error('Expected a full 40-character commit SHA.');
      return getAll(`/commits/${sha}/check-runs?per_page=100`, (body) => body?.check_runs);
    },
    async listWorkflowRuns(sha) {
      if (typeof sha !== 'string' || !SHA.test(sha)) throw new Error('Expected a full 40-character commit SHA.');
      return getAll(`/actions/runs?head_sha=${sha}&per_page=100`, (body) => body?.workflow_runs);
    },
  };
}
