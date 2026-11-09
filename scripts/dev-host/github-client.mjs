// Read-only GitHub REST client for the development-host controller (RO-034).
//
// Safety properties (pinned by github-client.test.mjs):
// - Only HTTP GET exists. There is no code path that sends POST/PATCH/PUT/DELETE.
// - Only https://api.github.com and only an allowlist of read endpoints for one repository.
// - The optional token is sent as a header only; it never appears in errors, warnings or the report.
// - Redirects are refused, so a response cannot move the request to another host.
// No AI service is called: this talks to GitHub only (ADR 0005, $0 additional AI API spending).

const API_ORIGIN = 'https://api.github.com';
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

/** Read endpoints the controller may call, relative to /repos/<owner>/<repo>. */
const ALLOWED = [
  /^\/pulls\?state=open&per_page=100$/,
  /^\/pulls\/[1-9][0-9]{0,8}\/reviews\?per_page=100$/,
  /^\/pulls\/[1-9][0-9]{0,8}\/comments\?per_page=100$/,
  /^\/issues\/[1-9][0-9]{0,8}\/comments\?per_page=100$/,
  /^\/commits\/[0-9a-f]{40}\/check-runs\?per_page=100$/,
];

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
  const warnings = [];
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
    const link = response.headers?.get?.('link') ?? '';
    if (/rel="next"/.test(link)) {
      warnings.push(`${relativePath} has more than 100 items; only the first page was read.`);
    }
    return response.json();
  }

  return {
    warnings,
    get callCount() {
      return calls;
    },
    listOpenPulls: async () => get('/pulls?state=open&per_page=100'),
    listIssueComments: async (number) => get(`/issues/${prNumber(number)}/comments?per_page=100`),
    listReviews: async (number) => get(`/pulls/${prNumber(number)}/reviews?per_page=100`),
    listReviewComments: async (number) => get(`/pulls/${prNumber(number)}/comments?per_page=100`),
    async listCheckRuns(sha) {
      if (typeof sha !== 'string' || !SHA.test(sha)) throw new Error('Expected a full 40-character commit SHA.');
      const body = await get(`/commits/${sha}/check-runs?per_page=100`);
      return Array.isArray(body?.check_runs) ? body.check_runs : [];
    },
  };
}
