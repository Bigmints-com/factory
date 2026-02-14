/**
 * Integration providers registration for newsfeed app
 * This file registers all available integration providers
 */

import { registerTrigger } from '@saveaday/integrations/server';
import { GITHUB_PAGES_DEPLOYMENT_TRIGGER } from '@saveaday/connector-github';


// Register GitHub Pages deployment trigger
console.log('[Integrations] Registering GitHub Pages deployment trigger');
registerTrigger(GITHUB_PAGES_DEPLOYMENT_TRIGGER);
console.log('[Integrations] Registration complete');

console.log('[Integrations] Registered triggers for newsfeed app');
