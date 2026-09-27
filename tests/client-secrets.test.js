import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoredAiConfig, saveStoredAiConfig } from '../src/utils/aiSettings.js';

test('provider keys are removed from legacy browser storage and never persisted by new saves', () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  globalThis.window = { dispatchEvent() {} };
  try {
    store.set('picks_ai_settings', JSON.stringify({ provider: 'custom', apiKey: 'old-test-key', selectedModel: 'test' }));
    assert.equal(getStoredAiConfig().apiKey, undefined);
    assert.equal(JSON.parse(store.get('picks_ai_settings')).apiKey, undefined);
    saveStoredAiConfig({ provider: 'custom', apiKey: 'new-test-key', selectedModel: 'test' });
    assert.equal(JSON.parse(store.get('picks_ai_settings')).apiKey, undefined);
    assert.equal(getStoredAiConfig().selectedModel, 'test');
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});
