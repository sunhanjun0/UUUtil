#!/usr/bin/env node
const path = require('path');

async function main() {
  const dbPath = process.argv[2] || path.join(process.env.HOME, 'Library/Application Support/Electron/assistant.db');
  const { initDatabase, flushDatabase, closeDatabase } = require('../dist/core/db');
  const { initializeDatabase } = require('../dist/plugins/focus');
  const { api } = require('../dist/plugins/focus/api');

  await initDatabase(dbPath);
  initializeDatabase();
  const result = api.resetAll();
  flushDatabase();
  closeDatabase();
  console.log(JSON.stringify({ dbPath, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
