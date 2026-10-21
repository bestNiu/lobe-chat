/**
 * Derives the GitHub archive download target for a market skill entry.
 *
 * A market skill only stores `github.url` (the repository root) plus an optional
 * `homepage`. When that homepage is a deep link into the same repository it also
 * carries the branch and the skill subdirectory, so the archive zip is rebuilt
 * from those two strings instead of being stored as a separate URL.
 */

export interface GitHubArchiveTarget {
  /** 最终 GitHub archive zip 地址 */
  archiveUrl: string;
  branch: string;
  owner: string;
  repo: string;
  subdir?: string;
}

const GITHUB_HOSTNAME = 'github.com';
const DEFAULT_BRANCH = 'main';

/**
 * Branch names may contain `/`, and a URL cannot say where the branch ends and
 * the subdirectory starts. These namespaces own the segment that follows them,
 * which covers the conventional `feature/x`, `fix/x` and `release/x` layout;
 * every other branch is read as a single segment.
 */
const BRANCH_NAMESPACES = new Set([
  'bugfix',
  'build',
  'chore',
  'ci',
  'dependabot',
  'docs',
  'experiment',
  'feat',
  'feature',
  'fix',
  'hotfix',
  'perf',
  'refactor',
  'release',
  'renovate',
  'test',
  'tests',
]);

interface RepoRef {
  owner: string;
  repo: string;
}

interface TreeRef {
  branch: string;
  /** Owner/repo the tree link points at, when it differs from github.url. */
  owner?: string;
  repo?: string;
  subdir?: string;
}

const parseGitHubUrl = (value: null | string | undefined): URL | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  return url.hostname.toLowerCase() === GITHUB_HOSTNAME ? url : undefined;
};

const pathSegments = (url: URL) => url.pathname.split('/').filter(Boolean);

const stripGitSuffix = (repo: string) => repo.replace(/\.git$/i, '');

const readRepoRef = (url: URL): RepoRef | undefined => {
  const [owner, repo] = pathSegments(url);
  const repoName = repo ? stripGitSuffix(repo) : '';
  if (!owner || !repoName) return undefined;

  return { owner, repo: repoName };
};

const splitBranch = (segments: string[]): TreeRef => {
  const [head, second, ...tail] = segments;

  if (!head) return { branch: DEFAULT_BRANCH };

  if (!second) {
    // `/tree/feature` cannot be told apart from a folder named `feature` under
    // the default branch, so keep the default branch and treat it as a folder.
    return BRANCH_NAMESPACES.has(head)
      ? { branch: DEFAULT_BRANCH, subdir: head }
      : { branch: head };
  }

  const branch = BRANCH_NAMESPACES.has(head) ? `${head}/${second}` : head;
  const subdir = (BRANCH_NAMESPACES.has(head) ? tail : [second, ...tail]).join('/');

  return subdir ? { branch, subdir } : { branch };
};

/**
 * Reads branch and subdirectory from a `/tree/...` homepage.
 *
 * A deep link into a different repository says nothing about this archive, so it
 * is ignored entirely and the default branch is used.
 */
const readTreeRef = (homepage: URL | undefined): TreeRef | undefined => {
  if (!homepage) return undefined;

  const [owner, repo, marker, ...rest] = pathSegments(homepage);
  if (!owner || !repo || marker !== 'tree') return undefined;

  // A `/tree/...` homepage is the skill's *actual* location. Some market rows
  // carry a `github.url` pointing at a different repo (e.g. `lobehub/lobehub`
  // while the skill lives in `lobehub/lobe-chat/tree/canary/...`), so the tree
  // link wins even when owner/repo differ.
  return { ...splitBranch(rest), owner, repo: stripGitSuffix(repo) };
};

/** `feature/x` stays a path inside the ref name, so only each segment is encoded. */
const encodeBranch = (branch: string) => branch.split('/').map(encodeURIComponent).join('/');

/**
 * Resolves the archive target for a market skill list item.
 *
 * Returns `undefined` when no GitHub repository can be read from `github.url`.
 * `null` / `undefined` items and empty fields are tolerated because the market
 * record stores both fields as optional.
 */
export function resolveGitHubArchive(
  item:
    | null
    | undefined
    | {
        github?: null | { url?: string } | undefined;
        homepage?: null | string | undefined;
      },
): GitHubArchiveTarget | undefined {
  const rootUrl = parseGitHubUrl(item?.github?.url);
  if (!rootUrl) return undefined;

  const root = readRepoRef(rootUrl);
  if (!root) return undefined;

  const tree = readTreeRef(parseGitHubUrl(item?.homepage));
  // Same repo (case-insensitively) → keep the spelling from `github.url`;
  // a genuinely different repo in the tree link wins.
  const sameRepo =
    tree?.owner?.toLowerCase() === root.owner.toLowerCase() &&
    tree?.repo?.toLowerCase() === root.repo.toLowerCase();
  const owner = tree && !sameRepo ? tree.owner! : root.owner;
  const repo = tree && !sameRepo ? tree.repo! : root.repo;
  const branch = tree?.branch ?? DEFAULT_BRANCH;
  const subdir = tree?.subdir;
  const refPath = `refs/heads/${encodeBranch(branch)}`;
  const archiveUrl = `https://github.com/${owner}/${repo}/archive/${refPath}.zip`;

  return {
    owner,
    repo,
    branch,
    ...(subdir ? { subdir } : {}),
    archiveUrl,
  };
}
