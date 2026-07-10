const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SETTINGS_VERSION = 1;

function normalizeAiNewsConfig(value = {}) {
  return {
    enabled: value.enabled === true,
    provider: 'cloud',
    models: {
      local: '',
      cloud: String(value.models?.cloud || '').trim().slice(0, 120),
    },
  };
}

function normalizePayload(value = {}) {
  const payload = value && typeof value === 'object' ? value : {};
  return {
    apiKey: String(payload.apiKey || '').trim().slice(0, 512),
    config: payload.config && typeof payload.config === 'object'
      ? normalizeAiNewsConfig(payload.config)
      : null,
  };
}

function writePrivateFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, data, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

function createEncryptedFileAiNewsSettingsStore(options = {}) {
  const filePath = options.filePath;
  const keyPath = options.keyPath;
  if (!filePath || !keyPath) throw new Error('Encrypted AI settings paths are required');

  let payload = null;
  const environmentApiKey = String(process.env.OLLAMA_API_KEY || '').trim();

  function getOrCreateKey() {
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath);
      if (key.length === 32) return key;
      throw new Error('Invalid AI settings encryption key');
    }
    const key = crypto.randomBytes(32);
    writePrivateFile(keyPath, key);
    return key;
  }

  function readPayload() {
    if (payload) return payload;
    if (!fs.existsSync(filePath)) {
      payload = normalizePayload();
      return payload;
    }

    try {
      const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getOrCreateKey(),
        Buffer.from(String(envelope.iv || ''), 'base64'),
      );
      decipher.setAuthTag(Buffer.from(String(envelope.tag || ''), 'base64'));
      const cleartext = Buffer.concat([
        decipher.update(Buffer.from(String(envelope.data || ''), 'base64')),
        decipher.final(),
      ]).toString('utf8');
      payload = normalizePayload(JSON.parse(cleartext));
    } catch (error) {
      console.error('[AI News encrypted settings read]', error.message);
      payload = normalizePayload();
    }
    return payload;
  }

  function persist() {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getOrCreateKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(readPayload()), 'utf8'),
      cipher.final(),
    ]);
    writePrivateFile(filePath, JSON.stringify({
      version: SETTINGS_VERSION,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    }));
  }

  return {
    persistent: true,
    get() { return environmentApiKey || readPayload().apiKey; },
    set(value) {
      readPayload().apiKey = String(value || '').trim();
      persist();
    },
    clear() {
      readPayload().apiKey = '';
      persist();
    },
    getConfig() { return normalizeAiNewsConfig(readPayload().config || {}); },
    hasConfig() { return !!readPayload().config; },
    setConfig(value) {
      readPayload().config = normalizeAiNewsConfig(value);
      persist();
    },
  };
}

module.exports = {
  createEncryptedFileAiNewsSettingsStore,
  normalizeAiNewsConfig,
};
