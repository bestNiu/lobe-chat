import createDebug from 'debug';
import { unzipSync, zipSync } from 'fflate';

import { resolveGitHubArchive } from './githubUrl';
import type { SnapshotItem } from './store';

const log = createDebug('youlin-market:skill-archive');

/** Refuse to buffer a repository archive larger than this. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export interface SkillArchiveResult {
  archive: Uint8Array;
  /** Path of SKILL.md inside the produced zip (always the root). */
  skillMdPath: string;
}

/**
 * Re-packages a sub-directory skill so its SKILL.md sits at the zip root.
 *
 * Why this exists: the app's `SkillImporter.importFromUrl` calls
 * `parseZipPackage()` without a `basePath`, so `findSkillMd()` only accepts
 * `SKILL.md` at the archive root or one level down. 97% of market skills live
 * under `/tree/<branch>/<subdir>/`, and a plain redirect to the repository
 * archive either fails ("SKILL.md not found") or — when the repo also has a
 * root SKILL.md — silently installs the wrong skill.
 *
 * Returns `undefined` when the item has no sub-directory (a redirect is fine
 * then) or when re-packaging cannot produce a root-level SKILL.md.
 */
export const buildSkillArchive = async (
  item: SnapshotItem,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SkillArchiveResult | undefined> => {
  // SAFETY: SnapshotItem is an open record (`[key: string]: unknown`), so TS
  // cannot see the two optional fields resolveGitHubArchive reads. Both are
  // validated defensively inside that function.
  const target = resolveGitHubArchive(
    item as unknown as { github?: { url?: string } | null; homepage?: string | null },
  );

  if (!target?.subdir) return undefined;

  const source = `https://codeload.github.com/${target.owner}/${target.repo}/zip/refs/heads/${target.branch}`;
  const doFetch = options.fetchImpl ?? fetch;

  let sourceBytes: Uint8Array;

  try {
    const response = await doFetch(source, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });

    if (!response.ok) {
      log('archive fetch failed %s: %d', source, response.status);

      return undefined;
    }

    sourceBytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    log('archive fetch error %s: %O', source, error);

    return undefined;
  }

  if (sourceBytes.byteLength > MAX_SOURCE_BYTES) {
    // Large monorepos (lobe-chat is ~80 MB zipped) blow through the buffer cap.
    // Fall back to pulling only the sub-directory through the GitHub API.
    log('archive too large (%d bytes), falling back to API', sourceBytes.byteLength);

    return buildFromApi(target, doFetch, options);
  }

  let entries: Record<string, Uint8Array>;

  try {
    entries = unzipSync(sourceBytes);
  } catch (error) {
    log('archive unzip failed: %O', error);

    return undefined;
  }

  // codeload zips wrap everything in `<repo>-<branch>/`.
  const prefix = `${target.repo}-${target.branch}/${target.subdir}/`;
  const stripped: Record<string, Uint8Array> = {};

  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/')) continue;
    if (!path.startsWith(prefix)) continue;
    stripped[path.slice(prefix.length)] = data;
  }

  if (!stripped['SKILL.md']) {
    log('no SKILL.md at %s (subdir=%s)', prefix, target.subdir);

    return undefined;
  }

  try {
    return { archive: zipSync(stripped), skillMdPath: 'SKILL.md' };
  } catch (error) {
    log('re-zip failed: %O', error);

    return undefined;
  }
};

/** Files above this many bytes are skipped when repacking through the API. */
const MAX_API_FILE_BYTES = 2 * 1024 * 1024;
const MAX_API_FILES = 200;
const MAX_API_TOTAL_BYTES = 20 * 1024 * 1024;

interface TreeEntry {
  path: string;
  size?: number;
  type: string;
}

/**
 * Rebuilds a sub-directory archive without downloading the whole repository.
 *
 * Used when the repository archive exceeds `MAX_SOURCE_BYTES`. Reads the git
 * tree once, then fetches only the blobs under the skill's sub-directory.
 */
const buildFromApi = async (
  target: { owner: string; repo: string; branch: string; subdir?: string },
  doFetch: typeof fetch,
  options: { timeoutMs?: number },
): Promise<SkillArchiveResult | undefined> => {
  if (!target.subdir) return undefined;

  const timeout = options.timeoutMs ?? 30_000;
  const treeUrl = `https://api.github.com/repos/${target.owner}/${target.repo}/git/trees/${encodeURIComponent(target.branch)}?recursive=1`;

  let tree: { tree?: TreeEntry[]; truncated?: boolean };

  try {
    const response = await doFetch(treeUrl, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'youlin-market' },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      log('tree API failed: %d', response.status);

      return undefined;
    }

    tree = (await response.json()) as typeof tree;
  } catch (error) {
    log('tree API error: %O', error);

    return undefined;
  }

  if (tree.truncated) log('tree listing truncated; some files may be missing');

  const prefix = `${target.subdir}/`;
  const blobs = (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
    .filter((entry) => (entry.size ?? 0) <= MAX_API_FILE_BYTES)
    .slice(0, MAX_API_FILES);

  if (!blobs.some((entry) => entry.path === `${prefix}SKILL.md`)) {
    log('no SKILL.md under %s', prefix);

    return undefined;
  }

  const files: Record<string, Uint8Array> = {};
  let total = 0;

  for (const blob of blobs) {
    const rawUrl = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${target.branch}/${blob.path}`;

    try {
      const response = await doFetch(rawUrl, { signal: AbortSignal.timeout(timeout) });

      if (!response.ok) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (total + bytes.byteLength > MAX_API_TOTAL_BYTES) break;

      total += bytes.byteLength;
      files[blob.path.slice(prefix.length)] = bytes;
    } catch (error) {
      log('raw fetch failed %s: %O', rawUrl, error);
    }
  }

  if (!files['SKILL.md']) return undefined;

  try {
    return { archive: zipSync(files), skillMdPath: 'SKILL.md' };
  } catch (error) {
    log('api re-zip failed: %O', error);

    return undefined;
  }
};
