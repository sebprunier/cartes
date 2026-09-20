import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { engine as desktopEngine } from '../electron/engine.js';
import { engine as webEngine } from '../web/engine.js';

// The interface is shared by the web page and the desktop application: both engines must offer the same
// functions, and only differ by what the platform can do.
describe('rendering engines', () => {
  const engines = { web: webEngine, bureau: desktopEngine };

  it('offer the same interface', () => {
    for (const [name, engine] of Object.entries(engines)) {
      assert.equal(typeof engine.estimate, 'function', name);
      assert.equal(typeof engine.generate, 'function', name);
      assert.equal(typeof engine.cancel, 'function', name);
      assert.equal(typeof engine.checkLayer, 'function', name);
      assert.equal(typeof engine.customLayerNote, 'string', name);
      assert.equal(typeof engine.zoomNote, 'string', name);
      assert.equal(typeof engine.privacyNote, 'string', name);
      assert.ok(Number.isInteger(engine.maxZoom), name);
      assert.ok(engine.formats.length > 0, name);
      for (const [value, label] of engine.formats) {
        assert.ok(['png', 'jpg', 'tif'].includes(value), `${name} ${value}`);
        assert.equal(typeof label, 'string', name);
      }
    }
  });

  it('let the desktop application load the tiles of the preview through its main process', () => {
    assert.equal(typeof desktopEngine.loadTile, 'function');
    assert.equal(webEngine.loadTile, undefined); // In a browser, the page downloads them itself.
  });

  it('give the desktop application at least the capabilities of the web page', () => {
    assert.ok(desktopEngine.maxZoom >= webEngine.maxZoom);
    const desktopFormats = desktopEngine.formats.map(([value]) => value);
    for (const [value] of webEngine.formats) assert.ok(desktopFormats.includes(value), value);
  });
});
