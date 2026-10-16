// Test-only preload (`node --import <this file>`): makes node:path's relative() and sep behave
// like Windows, so scripts/check-boundaries.test.mjs can prove on Linux/macOS CI that the boundary
// checker does not depend on the path separator (the owner runs `npm run verify` on Windows).
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

// Capture before patching: on Windows node:path *is* path.win32, so a wrapper calling
// path.win32.relative() would call itself (RO-021: stack overflow on native Windows).
const { relative, sep } = path.win32;
path.relative = relative;
path.sep = sep;
syncBuiltinESMExports();
