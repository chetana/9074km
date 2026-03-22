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
