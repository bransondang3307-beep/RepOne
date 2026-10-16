// Test-only preload (`node --import <this file>`): makes node:path's relative() and sep behave
// like Windows, so scripts/check-boundaries.test.mjs can prove on Linux/macOS CI that the boundary
// checker does not depend on the path separator (the owner runs `npm run verify` on Windows).
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

path.relative = (from, to) => path.win32.relative(from, to);
path.sep = path.win32.sep;
syncBuiltinESMExports();
