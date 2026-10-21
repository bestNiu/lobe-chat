import createDebug from 'debug';

import { resolveGitHubArchive } from './githubUrl';
import type { SnapshotItem } from './store';

const log = createDebug('youlin-market:skill-content');

/**
 * Fetches the SKILL.md body for a market skill.
 *
 * The upstream list rows carry no `content`, and the upstream detail endpoint
 * rejects machine tokens — so the body is read from the skill's own GitHub
 * repository instead. Only the raw file is requested; nothing is executed.
 */
export const fetchSkillContent = async (
  item: SnapshotItem,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string | undefined> => {
  const target = resolveGitHubArchive(
    item as unknown as { github?: { url?: string } | null; homepage?: string | null },
  );

  if (!target) return undefined;

  const base = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${target.branch}`;
  // A skill may live in a subdirectory, in which case SKILL.md sits beside it.
  const candidates = target.subdir
    ? [`${base}/${target.subdir}/SKILL.md`, `${base}/SKILL.md`]
    : [`${base}/SKILL.md`];

  const doFetch = options.fetchImpl ?? fetch;

  for (const url of candidates) {
    try {
      const response = await doFetch(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });

      if (!response.ok) continue;

      const text = await response.text();

      if (text.trim()) return text;
    } catch (error) {
      log('failed to fetch %s: %O', url, error);
    }
  }

  return undefined;
};
