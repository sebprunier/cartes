// Whether a version of the desktop application more recent than the one installed has been published. The
// installers are not signed (#7): the application cannot update itself on macOS, but it can say that a new
// version exists, on every system, and leave the installation to the town hall (#37).

// The latest version published, as GitHub gives it: drafts and pre-releases are left out by this address.
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/sebprunier/cartes/releases/latest';
// Where to download it: the page of the documentation, which explains the installation on each system.
export const DOWNLOAD_PAGE_URL = 'https://sebprunier.github.io/cartes/application-de-bureau.html';

/** A version « 1.2.3 » or « v1.2.3 » as three numbers, or undefined — a pre-release « 1.3.0-beta.1 » included. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? '').trim());
  return match ? match.slice(1, 4).map(Number) : undefined;
}

/** Whether version `candidate` is more recent than `current`: false when either is not a plain version. */
export function isNewer(candidate, current) {
  const [next, installed] = [parseVersion(candidate), parseVersion(current)];
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

/**
 * The release of GitHub to offer instead of the version installed: its version, the page of its notes, and the
 * page to download it from. Undefined when it is not more recent, or is a draft or a pre-release.
 */
export function newerRelease(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !isNewer(release.tag_name, currentVersion)) return undefined;
  return {
    version: release.tag_name.replace(/^v/, ''),
    notesUrl: release.html_url,
    downloadUrl: DOWNLOAD_PAGE_URL,
  };
}
