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
    log('archive too large (%d bytes), refusing', sourceBytes.byteLength);

    return undefined;
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
