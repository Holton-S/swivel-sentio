// Loads .env (git-ignored) before other modules read process.env. Imported first by server.js.
// Missing file or older Node: silently skipped, and shell environment variables still work.
try { process.loadEnvFile?.(); } catch { /* no .env */ }
