import { describe, expect, it } from 'vitest';

import { resolveGitHubArchive } from '../src/snapshot/githubUrl';

const REPO_URL = 'https://github.com/shipstatic/plugin';
const ARCHIVE_URL = 'https://github.com/shipstatic/plugin/archive/refs/heads/main.zip';

describe('resolveGitHubArchive', () => {
  it('reads branch and subdir from a deep link into the same repository', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: `${REPO_URL}/tree/main/skills/publish-online`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('defaults to main without a subdir when the homepage is missing', () => {
    expect(resolveGitHubArchive({ github: { url: REPO_URL } })).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
    });
  });

  it('defaults to main when the homepage is not a tree link', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: 'https://shipstatic.com/plugins/publish-online',
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
    });
  });

  it('keeps the branch but drops the subdir for a tree link without a folder', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: `${REPO_URL}/tree/develop`,
      }),
    ).toEqual({
      archiveUrl: 'https://github.com/shipstatic/plugin/archive/refs/heads/develop.zip',
      branch: 'develop',
      owner: 'shipstatic',
      repo: 'plugin',
    });
  });

  it('ignores a tree link that points at another repository', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: 'https://github.com/other-org/other-repo/tree/develop/skills/publish-online',
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
    });
  });

  it('matches the repository case-insensitively like GitHub does', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: 'https://github.com/ShipStatic/Plugin/tree/main/skills/publish-online',
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('drops a .git suffix from github.url', () => {
    expect(
      resolveGitHubArchive({
        github: { url: `${REPO_URL}.git` },
        homepage: `${REPO_URL}/tree/main/skills/publish-online`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('drops a query string from github.url', () => {
    expect(
      resolveGitHubArchive({
        github: { url: `${REPO_URL}?tab=readme-ov-file` },
        homepage: `${REPO_URL}/tree/main/skills/publish-online`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('drops a fragment from github.url', () => {
    expect(
      resolveGitHubArchive({
        github: { url: `${REPO_URL}#readme` },
        homepage: `${REPO_URL}/tree/main/skills/publish-online`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('accepts a plain http repository url', () => {
    expect(
      resolveGitHubArchive({
        github: { url: 'http://github.com/shipstatic/plugin' },
        homepage: 'http://github.com/shipstatic/plugin/tree/main/skills/publish-online',
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('preserves a slash inside the branch name', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: `${REPO_URL}/tree/feature/x/skills/publish-online`,
      }),
    ).toEqual({
      archiveUrl: 'https://github.com/shipstatic/plugin/archive/refs/heads/feature/x.zip',
      branch: 'feature/x',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });

  it('preserves a slash inside the branch name without a subdir', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: `${REPO_URL}/tree/feature/x`,
      }),
    ).toEqual({
      archiveUrl: 'https://github.com/shipstatic/plugin/archive/refs/heads/feature/x.zip',
      branch: 'feature/x',
      owner: 'shipstatic',
      repo: 'plugin',
    });
  });

  it('falls back to main and keeps an undecidable branch namespace as the subdir', () => {
    expect(
      resolveGitHubArchive({
        github: { url: REPO_URL },
        homepage: `${REPO_URL}/tree/feature`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'feature',
    });
  });

  it('returns undefined when github.url is missing', () => {
    expect(resolveGitHubArchive({ homepage: `${REPO_URL}/tree/main/skills/publish-online` })).toBe(
      undefined,
    );
    expect(resolveGitHubArchive({ github: null, homepage: REPO_URL })).toBe(undefined);
    expect(resolveGitHubArchive({ github: {}, homepage: REPO_URL })).toBe(undefined);
  });

  it('returns undefined for a non-github repository host', () => {
    expect(
      resolveGitHubArchive({
        github: { url: 'https://gitlab.com/shipstatic/plugin' },
        homepage: 'https://gitlab.com/shipstatic/plugin/tree/main/skills/publish-online',
      }),
    ).toBe(undefined);
  });

  it('returns undefined when owner and repo cannot be read', () => {
    expect(resolveGitHubArchive({ github: { url: 'https://github.com/shipstatic' } })).toBe(
      undefined,
    );
    expect(resolveGitHubArchive({ github: { url: 'https://github.com/' } })).toBe(undefined);
    expect(resolveGitHubArchive({ github: { url: 'shipstatic/plugin' } })).toBe(undefined);
  });

  it('returns undefined for empty, null and undefined fields', () => {
    expect(resolveGitHubArchive(undefined)).toBe(undefined);
    expect(resolveGitHubArchive(null)).toBe(undefined);
    expect(resolveGitHubArchive({})).toBe(undefined);
    expect(resolveGitHubArchive({ github: { url: '' }, homepage: '' })).toBe(undefined);
    expect(resolveGitHubArchive({ github: { url: '   ' }, homepage: '   ' })).toBe(undefined);
    expect(resolveGitHubArchive({ github: { url: undefined }, homepage: null })).toBe(undefined);
  });

  it('tolerates a trailing slash on both urls', () => {
    expect(
      resolveGitHubArchive({
        github: { url: `${REPO_URL}/` },
        homepage: `${REPO_URL}/tree/main/skills/publish-online/`,
      }),
    ).toEqual({
      archiveUrl: ARCHIVE_URL,
      branch: 'main',
      owner: 'shipstatic',
      repo: 'plugin',
      subdir: 'skills/publish-online',
    });
  });
});
