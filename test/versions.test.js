import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DOWNLOAD_PAGE_URL, isNewer, newerRelease, parseVersion } from '../src/core/versions.js';

describe('parseVersion', () => {
  it('reads a version, with or without its « v », and nothing else', () => {
    assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseVersion(' 0.10.0 '), [0, 10, 0]);
    for (const text of ['1.3.0-beta.1', '1.2', 'v1', 'dernière', '', undefined, null]) {
      assert.equal(parseVersion(text), undefined, String(text));
    }
  });
});

describe('isNewer', () => {
  it('compares the numbers one by one, and not as text', () => {
    assert.ok(isNewer('v0.10.0', '0.9.3'));
    assert.ok(isNewer('1.0.0', '0.12.4'));
    assert.ok(isNewer('1.0.1', '1.0.0'));
    assert.ok(!isNewer('1.0.0', '1.0.0'));
    assert.ok(!isNewer('0.9.9', '1.0.0'));
    assert.ok(!isNewer('1.1.0-beta.1', '1.0.0'));
  });
});

describe('newerRelease', () => {
  const release = {
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/sebprunier/cartes/releases/tag/v1.1.0',
    draft: false,
    prerelease: false,
  };

  it('offers a release more recent than the version installed, with where to read and download it', () => {
    assert.deepEqual(newerRelease(release, '1.0.0'), {
      version: '1.1.0',
      notesUrl: 'https://github.com/sebprunier/cartes/releases/tag/v1.1.0',
      downloadUrl: DOWNLOAD_PAGE_URL,
    });
  });

  it('offers nothing when the version installed is the last one, or when GitHub answers something else', () => {
    assert.equal(newerRelease(release, '1.1.0'), undefined);
    assert.equal(newerRelease({ ...release, prerelease: true }, '1.0.0'), undefined);
    assert.equal(newerRelease({ ...release, draft: true }, '1.0.0'), undefined);
    assert.equal(newerRelease({ message: 'API rate limit exceeded' }, '1.0.0'), undefined);
    assert.equal(newerRelease(undefined, '1.0.0'), undefined);
  });
});
