#!/usr/bin/env node
// Génère envvars.yaml depuis .env pour gcloud run deploy
// Gère les valeurs contenant des virgules (ex: GCS_SERVICE_ACCOUNT_JSON)
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const outPath = path.join(__dirname, 'envvars.yaml');

const raw = fs.readFileSync(envPath, 'utf8');
const lines = raw.split('\n');

const vars = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1);
  vars[key] = val;
}

// Override LOGTO_BASE_URL with prod URL (local .env has localhost for dev)
vars.LOGTO_BASE_URL = 'https://lys.chetana.dev';

let yaml = '';
for (const [key, val] of Object.entries(vars)) {
  // Clean trailing literal \n sequences
  const cleaned = val.replace(/\\n$/g, '').trim();
  // Escape single quotes in value
  const escaped = cleaned.replace(/'/g, "''");
  yaml += `${key}: '${escaped}'\n`;
}

fs.writeFileSync(outPath, yaml, 'utf8');
console.log('envvars.yaml generated with', Object.keys(vars).length, 'variables');

// ── Bump version.ts at each deploy ─────────────────────────────────
const versionPath = path.join(__dirname, 'src/lib/version.ts');
try {
  const current = fs.readFileSync(versionPath, 'utf8');
  const match = current.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
  if (match) {
    const [, major, minor, patch] = match;
    const next = `${major}.${minor}.${Number(patch) + 1}`;
    const updated = `// Auto-bumped on each deploy (gen-envvars.cjs) — git pre-commit hook overwrites with commit count
export const APP_VERSION = '${next}';\n`;
    fs.writeFileSync(versionPath, updated, 'utf8');
    console.log(`APP_VERSION bumped: ${match[1]}.${match[2]}.${match[3]} → ${next}`);
  }
} catch (e) {
  console.warn('Could not bump version.ts:', e.message);
}
