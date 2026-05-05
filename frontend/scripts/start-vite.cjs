#!/usr/bin/env node
// scripts/start-vite.cjs
//
// This wrapper exists because the platform supervisor was originally
// configured for an Expo project and runs `yarn expo start --tunnel --port 3000`.
// We migrated this app from Expo to Vite + React, so we redirect that command
// to the Vite dev server. Any positional/CLI args from the supervisor are
// intentionally ignored — Vite's flags differ from Expo's.
//
// Used in two places:
//   1. As the `expo` script in package.json so `yarn expo …` always works
//      regardless of whether node_modules/.bin/expo exists.
//   2. As a postinstall fallback if you want to recreate the binary shim.

const { spawn } = require('child_process');
const path = require('path');

const vite = path.resolve(__dirname, '..', 'node_modules', '.bin', 'vite');
const args = ['--host', '0.0.0.0', '--port', '3000'];

const child = spawn(vite, args, {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[start-vite] failed to launch vite:', err);
  process.exit(1);
});
