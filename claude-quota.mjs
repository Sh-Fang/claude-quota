#!/usr/bin/env node
// claude-quota.mjs
// Claude Code status line: context usage / model / daily cost
// Cross-platform (Windows / macOS / Linux), Node 18+, no dependencies

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Gateway base URL, falls back to ANTHROPIC_BASE_URL when empty
const GATEWAY_BASE_URL = '';
// Daily cost limit in USD
const DAILY_LIMIT = 400;

const BAR_WIDTH = 10;
const WARN_PCT = 60;
const CRIT_PCT = 85;
const CACHE_TTL_SECONDS = 60;
const LOCK_STALE_SECONDS = 60;
const HTTP_TIMEOUT_MS = 6000;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'claude-quota.json');
const LOCK_DIR = path.join(CACHE_DIR, 'claude-quota.lock');

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const CYAN = `${ESC}38;5;80m`;
const GREEN = `${ESC}38;5;114m`;
const YELLOW = `${ESC}38;5;221m`;
const RED = `${ESC}38;5;203m`;
const GRAY = `${ESC}38;5;245m`;
const BAR_EMPTY_BG = `${ESC}48;5;238m`;
const SEP = `  ${GRAY}|${RESET}  `;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch {
    fs.rmSync(tmp, { force: true });
  }
}

function ageSeconds(file) {
  try {
    return (Date.now() - fs.statSync(file).mtimeMs) / 1000;
  } catch {
    return Infinity;
  }
}

function getAuth() {
  const settings = readJson(path.join(CLAUDE_DIR, 'settings.json')) ?? {};
  const env = settings.env ?? {};
  return {
    token: process.env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_AUTH_TOKEN || '',
    baseUrl: GATEWAY_BASE_URL || process.env.ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL || '',
  };
}

/** Fetch gateway /v1/usage and write it to the cache. */
async function refreshCache() {
  const { token, baseUrl } = getAuth();
  try {
    if (!token || !baseUrl) return;
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/usage`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.usage?.today == null) return;
    writeJsonAtomic(CACHE_FILE, data);
  } catch {
    // Ignore network errors and keep the old cache
  } finally {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

/** Spawn a detached process to refresh the cache without blocking rendering. */
function triggerBackgroundRefresh() {
  if (ageSeconds(LOCK_DIR) > LOCK_STALE_SECONDS) {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
  try {
    fs.mkdirSync(LOCK_DIR);
  } catch {
    return;
  }
  try {
    spawn(process.execPath, [SCRIPT_PATH, '--refresh'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } catch {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

function pctColor(pct) {
  if (pct >= CRIT_PCT) {
    return RED;
  } else if (pct >= WARN_PCT) {
    return YELLOW;
  } else {
    return GREEN;
  }
}

function bar(pct, color) {
  const clamped = Math.max(0, Math.min(100, pct));
  let filled = Math.floor((clamped * BAR_WIDTH) / 100);
  if (filled === 0 && clamped > 0) filled = 1;
  // Filled cells use the foreground color code as background, empty cells use gray background
  const fillBg = color.replace('38;5;', '48;5;');
  return `${fillBg}${' '.repeat(filled)}${BAR_EMPTY_BG}${' '.repeat(BAR_WIDTH - filled)}${RESET}`;
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function render(input) {
  const parts = [];

  const ctxPct = Math.floor(Number(input?.context_window?.used_percentage) || 0);
  const ctxColor = pctColor(ctxPct);
  parts.push(`${GRAY}Context${RESET} ${bar(ctxPct, ctxColor)} ${ctxColor}${ctxPct}%${RESET}`);

  const model = input?.model?.display_name;
  if (model) parts.push(`${CYAN}${BOLD}${model}${RESET}`);

  const cache = readJson(CACHE_FILE);
  const todayCost = Number(cache?.usage?.today?.cost);
  if (cache && Number.isFinite(todayCost)) {
    const dayPct = Math.floor((todayCost * 100) / DAILY_LIMIT);
    const dayColor = pctColor(dayPct);
    parts.push(
      `${GRAY}Cost${RESET} ${dayColor}$${todayCost.toFixed(2)}${GRAY}/$${DAILY_LIMIT}${RESET} ` +
        `${bar(dayPct, dayColor)} ${dayColor}${dayPct}%${RESET}`,
    );
  } else {
    parts.push(`${GRAY}Cost loading...${RESET}`);
  }

  return parts.join(SEP);
}

if (process.argv.includes('--refresh')) {
  await refreshCache();
} else {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const input = readStdin();
  if (ageSeconds(CACHE_FILE) >= CACHE_TTL_SECONDS) triggerBackgroundRefresh();
  process.stdout.write(render(input) + '\n');
}
