#!/usr/bin/env node

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register tsx loader so we can import .ts files
register('tsx/esm', pathToFileURL('./'));

// Now import and run the CLI
await import('./engine/cli.ts');
