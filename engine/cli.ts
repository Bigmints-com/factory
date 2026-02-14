#!/usr/bin/env node

/**
 * Factory CLI — thin dispatcher.
 *
 * Usage:
 *   factory build <spec.yaml>                Full pipeline (gather → validate → plan → build → test → iterate → push)
 *   factory validate <spec.yaml>             Validate a spec
 *   factory status                           Show spec statuses
 *   factory project add <repo-path>          Connect a repo
 *   factory project list                     List connected repos
 *   factory project switch <id>              Switch active project
 *   factory project remove <id>              Disconnect a repo
 *   factory feature build <spec.yaml>        Build a feature
 *   factory feature validate <spec.yaml>     Validate a feature spec
 */

import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { loadSpec, loadFeatureSpec, listSpecs, validateSpec, validateFeatureSpec, updateSpecStatus, updateSpecBuildMeta, archiveSpec } from './spec.ts';
import { loadProjects, getActiveProject, addProject, removeProject, switchProject, loadBridgeConfig } from './config.ts';
import { gatherContext } from './context.ts';
import { runPipeline, runFeaturePipeline } from './generate.ts';
import { writeFiles, setupProject, gitCommit, gitPush, writeKnowledgeEntry, writeAppAgentsMd } from './writer.ts';
import { log, logHeader, logStep, logError } from './log.ts';
import { specSlug, specPort, type ProjectStack } from './types.ts';
import {
    enqueue, dequeue, listQueue, getQueueStats,
    markRunning, markCompleted, markFailed,
    removeItem, clearCompleted, retryItem,
    isQueueRunning, setQueueRunning,
} from './queue.ts';
import { closeDb, logBuild } from './db.ts';

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

async function main(): Promise<void> {
    switch (command) {
        case 'build':
            return handleBuild(target);
        case 'validate':
            return handleValidate(target);
        case 'status':
            return handleStatus();
        case 'sync':
            return handleSync(target);
        case 'init-bridge':
            return handleInitBridge(target);
        case 'project':
            return handleProject(target, args[2]);
        case 'feature':
            return handleFeature(target, args[2]);
        case 'queue':
            return handleQueue(target, args[2]);
        default:
            printUsage();
            process.exit(command ? 1 : 0);
    }
}

// ─── Build ───────────────────────────────────────────────

async function handleBuild(specPath?: string): Promise<void> {
    requireTarget('build');
    const spec = loadSpec(specPath!);
    const project = getActiveProject();

    logHeader(`Build: ${spec.appName}`);

    // Step 1: Validate
    logStep(1, 7, 'Validating spec...');
    const validation = validateSpec(spec);
    if (!validation.passed) {
        logError('Spec validation failed:');
        for (const err of validation.errors) {
            log('  ', `  ✗ ${err}`);
        }
        process.exit(1);
    }
    log('✓', 'Spec is valid');

    // Step 2: Gather context
    logStep(2, 7, 'Gathering context...');
    const bridge = loadBridgeConfig(project.path);
    const context = gatherContext(project.path, bridge);

    // Steps 3-5: Plan → Build → Test → Iterate (inside runPipeline)
    const result = await runPipeline(spec, context);

    // Step 6: Write files
    logStep(6, 7, 'Writing files to repo...');
    const slug = specSlug(spec);
    const targetDir = bridge.apps_dir
        ? resolve(project.path, bridge.apps_dir, slug)
        : resolve(project.path, slug);
    writeFiles(targetDir, result.files);
    setupProject(targetDir, spec.stack.packageManager);

    // Knowledge feedback + AGENTS.md
    writeKnowledgeEntry(project.path, spec.appName, result, spec.stack, specPath!);
    writeAppAgentsMd(targetDir, spec.appName, spec.stack, result.files);

    // Step 7: Git commit + push
    logStep(7, 7, 'Committing and pushing...');
    gitCommit(project.path, `factory: generate ${spec.appName}`);
    gitPush(project.path);

    // Step 8: Write build metadata back into spec + archive
    updateSpecBuildMeta(specPath!, {
        outputDir: targetDir,
        filesGenerated: result.files.length,
        iterations: result.iterations,
        taskType: result.plan.decisions[0] || 'unknown',
    }, project.path);
    if (result.success) {
        archiveSpec(specPath!);
    }

    // Summary
    console.log('');
    console.log('═'.repeat(50));
    log('✓', `Build ${result.success ? 'COMPLETE' : 'DONE (with warnings)'}`);
    log('→', `App: ${spec.appName} (${slug})`);
    log('→', `Files: ${result.files.length}`);
    log('→', `Iterations: ${result.iterations}`);
    log('→', `Output: ${targetDir}`);
    if (result.errors && result.errors.length > 0) {
        log('!', `${result.errors.length} warning(s) remaining`);
    }
    console.log('');

    process.exit(result.success ? 0 : 1);
}

// ─── Validate ────────────────────────────────────────────

function handleValidate(specPath?: string): void {
    requireTarget('validate');
    const spec = loadSpec(specPath!);

    logHeader(`Validate: ${spec.appName}`);

    const result = validateSpec(spec);
    if (result.passed) {
        log('✓', 'All checks passed!');
    } else {
        for (const err of result.errors) {
            log('✗', err);
        }
        log('✗', `${result.errors.length} error(s) found`);
    }

    process.exit(result.passed ? 0 : 1);
}

// ─── Status ──────────────────────────────────────────────

function handleStatus(): void {
    logHeader('Status');

    try {
        const project = getActiveProject();
        log('→', `Active project: ${project.name} (${project.path})`);
        console.log('');

        const specs = listSpecs(project.path);

        if (specs.apps.length === 0 && specs.features.length === 0) {
            log('!', 'No specs found. Add YAML files to .factory/specs/apps/ or .factory/specs/features/');
            return;
        }

        if (specs.apps.length > 0) {
            console.log('App Specs:');
            for (const file of specs.apps) {
                try {
                    const spec = loadSpec(resolve(project.path, '.factory', 'specs', 'apps', file));
                    const slug = specSlug(spec);
                    const port = specPort(spec);
                    const status = spec.status || 'draft';
                    const icon = status === 'done' ? '✅' : status === 'in-progress' ? '🔄' : '📝';
                    log('  ', `  ${icon} ${slug} — ${spec.appName} (port ${port}) [${status}]`);
                } catch {
                    log('  ', `  ❌ ${file} — failed to parse`);
                }
            }
        }

        if (specs.features.length > 0) {
            console.log('');
            console.log('Feature Specs:');
            for (const file of specs.features) {
                try {
                    const spec = loadFeatureSpec(resolve(project.path, '.factory', 'specs', 'features', file));
                    log('  ', `  📋 ${spec.feature.slug} — ${spec.feature.name} → ${spec.target.app}`);
                } catch {
                    log('  ', `  ❌ ${file} — failed to parse`);
                }
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            logError(error.message);
        }
        process.exit(1);
    }

    console.log('');
}

// ─── Sync & Init Bridge ──────────────────────────────────

function handleSync(repoPath?: string): void {
    requireTarget('sync');
    const absPath = resolve(repoPath!);
    logHeader(`Sync: ${absPath}`);

    if (!existsSync(absPath)) {
        logError(`Path does not exist: ${absPath}`);
        process.exit(1);
    }

    // In the new engine, sync just ensures .factory exists
    // Context is gathered on-demand during build
    const factoryDir = resolve(absPath, '.factory');
    if (existsSync(factoryDir)) {
        log('✓', '.factory directory found');
    } else {
        log('!', 'No .factory directory — run: factory project add <path>');
    }

    log('✓', 'Sync complete');
}

function handleInitBridge(repoPath?: string): void {
    requireTarget('init-bridge');
    const absPath = resolve(repoPath!);
    logHeader(`Init Bridge: ${absPath}`);
    addProject(absPath);
}

// ─── Project ─────────────────────────────────────────────

function handleProject(subcommand?: string, arg?: string): void {
    if (!subcommand) {
        console.error('Usage: factory project <add|list|switch|remove> [argument]');
        process.exit(1);
    }

    switch (subcommand) {
        case 'add': {
            if (!arg) {
                console.error('Usage: factory project add <repo-path>');
                process.exit(1);
            }

            // Parse optional flags
            const flags = parseFlags(args.slice(3));
            const stack: ProjectStack | undefined = flags.framework
                ? {
                    framework: flags.framework as string,
                    packageManager: (flags.pm as string) || 'npm',
                    linter: flags.linter as string | undefined,
                    testing: flags.testing as string | undefined,
                }
                : undefined;

            addProject(resolve(arg), stack);
            break;
        }
        case 'list': {
            const config = loadProjects();
            if (config.projects.length === 0) {
                log('!', 'No projects registered');
            } else {
                for (const p of config.projects) {
                    const marker = p.id === config.activeProject ? '● ' : '  ';
                    log('  ', `${marker}${p.name} (${p.id})`);
                    log('  ', `    ${p.path}`);
                }
            }
            break;
        }
        case 'switch': {
            if (!arg) { console.error('Usage: factory project switch <id>'); process.exit(1); }
            switchProject(arg);
            break;
        }
        case 'remove': {
            if (!arg) { console.error('Usage: factory project remove <id>'); process.exit(1); }
            removeProject(arg);
            break;
        }
        default:
            console.error(`Unknown project command: ${subcommand}`);
            process.exit(1);
    }
}

// ─── Feature ─────────────────────────────────────────────

async function handleFeature(subcommand?: string, specPath?: string): Promise<void> {
    if (!subcommand) {
        console.error('Usage: factory feature <build|validate> <spec.yaml>');
        process.exit(1);
    }

    switch (subcommand) {
        case 'validate': {
            if (!specPath) { console.error('Usage: factory feature validate <spec.yaml>'); process.exit(1); }
            const spec = loadFeatureSpec(specPath);

            logHeader(`Validate Feature: ${spec.feature.name}`);
            const result = validateFeatureSpec(spec);
            if (result.passed) {
                log('✓', 'Feature spec is valid');
            } else {
                for (const err of result.errors) log('✗', err);
            }
            process.exit(result.passed ? 0 : 1);
            break;
        }
        case 'build': {
            if (!specPath) { console.error('Usage: factory feature build <spec.yaml>'); process.exit(1); }
            const spec = loadFeatureSpec(specPath);
            const project = getActiveProject();

            logHeader(`Feature Build: ${spec.feature.name}`);

            const bridge = loadBridgeConfig(project.path);
            const context = gatherContext(project.path, bridge);

            const result = await runFeaturePipeline(spec, context);

            // Write files to the target app directory
            const targetDir = bridge.apps_dir
                ? resolve(project.path, bridge.apps_dir, spec.target.app)
                : resolve(project.path, spec.target.app);
            writeFiles(targetDir, result.files);

            // Git commit + push
            gitCommit(project.path, `factory: add feature ${spec.feature.name} to ${spec.target.app}`);
            gitPush(project.path);

            log('✓', `Feature built: ${result.files.length} files`);
            console.log('');
            break;
        }
        default:
            console.error(`Unknown feature command: ${subcommand}`);
            process.exit(1);
    }
}

// ─── Queue ───────────────────────────────────────────────

async function handleQueue(subcommand?: string, arg?: string): Promise<void> {
    if (!subcommand) {
        console.error('Usage: factory queue <list|add|start|stats|clear|retry|remove> [argument]');
        process.exit(1);
    }

    switch (subcommand) {
        case 'list': {
            const items = listQueue();
            if (items.length === 0) {
                log('!', 'Queue is empty');
            } else {
                logHeader('Build Queue');
                for (const item of items) {
                    const icon = item.status === 'completed' ? '✅'
                        : item.status === 'running' ? '🔄'
                        : item.status === 'failed' ? '❌'
                        : item.status === 'needs-attention' ? '⚠️'
                        : '⏳';
                    log('  ', `${icon} [${item.id}] ${item.specFile} (${item.kind}) — ${item.status}`);
                    if (item.error) {
                        log('  ', `    Error: ${item.error.slice(0, 100)}`);
                    }
                    if (item.durationMs) {
                        log('  ', `    Duration: ${(item.durationMs / 1000).toFixed(1)}s`);
                    }
                }
            }
            console.log('');
            break;
        }

        case 'add': {
            if (!arg) { console.error('Usage: factory queue add <spec.yaml>'); process.exit(1); }
            const specPath = resolve(arg);
            if (!existsSync(specPath)) {
                logError(`Spec file not found: ${specPath}`);
                process.exit(1);
            }

            // Detect kind
            let kind: 'AppSpec' | 'FeatureSpec' = 'AppSpec';
            try {
                loadFeatureSpec(specPath);
                kind = 'FeatureSpec';
            } catch { /* assume AppSpec */ }

            const item = enqueue(specPath, kind);
            log('✓', `Queued: ${item.specFile} (${item.kind}) → ${item.id}`);
            break;
        }

        case 'start': {
            return handleQueueStart();
        }

        case 'stats': {
            const stats = getQueueStats();
            logHeader('Queue Stats');
            log('  ', `  Pending:      ${stats.pending}`);
            log('  ', `  Running:      ${stats.running}`);
            log('  ', `  Completed:    ${stats.completed}`);
            log('  ', `  Failed:       ${stats.failed}`);
            log('  ', `  Needs Attn:   ${stats['needs-attention']}`);
            log('  ', `  ─────────────`);
            log('  ', `  Total:        ${stats.total}`);
            log('  ', `  Running:      ${isQueueRunning() ? 'YES' : 'no'}`);
            console.log('');
            break;
        }

        case 'clear': {
            const removed = clearCompleted();
            log('✓', `Cleared ${removed} completed item(s)`);
            break;
        }

        case 'retry': {
            if (!arg) { console.error('Usage: factory queue retry <id>'); process.exit(1); }
            const item = retryItem(arg);
            if (item) {
                log('✓', `Reset to pending: ${item.specFile}`);
            } else {
                logError(`Item not found: ${arg}`);
            }
            break;
        }

        case 'remove': {
            if (!arg) { console.error('Usage: factory queue remove <id>'); process.exit(1); }
            const removed = removeItem(arg);
            if (removed) {
                log('✓', `Removed: ${arg}`);
            } else {
                logError(`Item not found: ${arg}`);
            }
            break;
        }

        default:
            console.error(`Unknown queue command: ${subcommand}`);
            process.exit(1);
    }

    closeDb();
}

/**
 * Process all pending queue items autonomously.
 * This is the "run while I sleep" mode.
 */
async function handleQueueStart(): Promise<void> {
    if (isQueueRunning()) {
        logError('Queue is already running');
        process.exit(1);
    }

    logHeader('🏭 Autonomous Build — Starting');

    setQueueRunning(true);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
        const project = getActiveProject();
        const bridge = loadBridgeConfig(project.path);
        const context = gatherContext(project.path, bridge);

        let item = dequeue();

        while (item) {
            processed++;
            const startTime = Date.now();

            console.log('');
            const current = item; // capture for TS narrowing
            logHeader(`[${processed}] Processing: ${current.specFile}`);
            markRunning(current.id);

            // Set spec status to in-progress
            updateSpecStatus(current.specFile, 'in-progress');

            try {
                if (current.kind === 'FeatureSpec') {
                    // Feature build
                    const spec = loadFeatureSpec(current.specFile);
                    const result = await runFeaturePipeline(spec, context);

                    const targetDir = bridge.apps_dir
                        ? resolve(project.path, bridge.apps_dir, spec.target.app)
                        : resolve(project.path, spec.target.app);
                    writeFiles(targetDir, result.files);
                    setupProject(targetDir, bridge.stack?.packageManager);

                    // Knowledge feedback + AGENTS.md
                    const featureStack = bridge.stack || { framework: 'unknown', packageManager: 'npm' };
                    writeKnowledgeEntry(project.path, spec.feature.name, result, featureStack, current.specFile);
                    writeAppAgentsMd(targetDir, spec.feature.name, featureStack, result.files);

                    const durationMs = Date.now() - startTime;
                    markCompleted(current.id, `${result.files.length} files generated`, durationMs);
                    logBuild(current.specFile, 'FeatureSpec', 'completed', result.files.map(f => f.filename), `${result.files.length} files generated`, durationMs);
                    updateSpecStatus(current.specFile, 'done');
                    gitCommit(project.path, `factory: add feature ${spec.feature.name} to ${spec.target.app}`);
                    succeeded++;
                } else {
                    // App build — full pipeline
                    const spec = loadSpec(current.specFile);
                    const validation = validateSpec(spec);

                    if (!validation.passed) {
                        const durationMs = Date.now() - startTime;
                        markFailed(current.id, `Validation failed: ${validation.errors.join(', ')}`, '', durationMs);
                        logBuild(current.specFile, 'AppSpec', 'failed', [], `Validation: ${validation.errors.join(', ')}`, durationMs);
                        updateSpecStatus(current.specFile, 'review');
                        failed++;
                        item = dequeue();
                        continue;
                    }

                    // Mark as validating
                    updateSpecStatus(current.specFile, 'validation');
                    const result = await runPipeline(spec, context);

                    const slug = specSlug(spec);
                    const targetDir = bridge.apps_dir
                        ? resolve(project.path, bridge.apps_dir, slug)
                        : resolve(project.path, slug);
                    writeFiles(targetDir, result.files);
                    setupProject(targetDir, spec.stack.packageManager);

                    // Knowledge feedback + AGENTS.md
                    writeKnowledgeEntry(project.path, spec.appName, result, spec.stack, current.specFile);
                    writeAppAgentsMd(targetDir, spec.appName, spec.stack, result.files);

                    const durationMs = Date.now() - startTime;
                    const fileNames = result.files.map(f => f.filename);

                    if (result.success) {
                        markCompleted(current.id, `${result.files.length} files, ${result.iterations} iteration(s)`, durationMs);
                        logBuild(current.specFile, 'AppSpec', 'completed', fileNames, `${result.files.length} files, ${result.iterations} iteration(s)`, durationMs);
                        updateSpecStatus(current.specFile, 'done');
                        gitCommit(project.path, `factory: generate ${spec.appName}`);

                        // Write build metadata + archive spec
                        updateSpecBuildMeta(current.specFile, {
                            outputDir: targetDir,
                            filesGenerated: result.files.length,
                            iterations: result.iterations,
                            taskType: result.plan.decisions[0] || 'unknown',
                        }, project.path);
                        archiveSpec(current.specFile);
                        succeeded++;
                    } else {
                        markFailed(
                            current.id,
                            result.errors?.join('; ') || 'Build had warnings',
                            `${result.files.length} files generated with errors`,
                            durationMs
                        );
                        logBuild(current.specFile, 'AppSpec', 'failed', fileNames, result.errors?.join('; ') || 'Build had warnings', durationMs);
                        updateSpecStatus(current.specFile, 'review');
                        failed++;
                    }
                }
            } catch (error) {
                const durationMs = Date.now() - startTime;
                const msg = error instanceof Error ? error.message : String(error);
                markFailed(current.id, msg, '', durationMs);
                logBuild(current.specFile, current.kind, 'failed', [], msg, durationMs);
                updateSpecStatus(current.specFile, 'review');
                logError(`Failed: ${msg}`);
                failed++;
            }

            // Dequeue the next one — keep going
            item = dequeue();
        }

        // Push all changes at once at the end
        if (succeeded > 0) {
            log('●', 'Pushing all changes...');
            gitPush(project.path);
        }
    } finally {
        setQueueRunning(false);
        closeDb();
    }

    // Summary
    console.log('');
    console.log('═'.repeat(50));
    log('✓', `Autonomous build complete`);
    log('→', `Processed: ${processed}`);
    log('→', `Succeeded: ${succeeded}`);
    log('→', `Failed:    ${failed}`);
    console.log('');
}

// ─── Helpers ─────────────────────────────────────────────

function requireTarget(cmd: string): void {
    if (!target) {
        console.error(`Usage: factory ${cmd} <spec.yaml>`);
        process.exit(1);
    }
}

function parseFlags(flagArgs: string[]): Record<string, string> {
    const flags: Record<string, string> = {};
    for (let i = 0; i < flagArgs.length; i += 2) {
        const key = flagArgs[i]?.replace(/^--/, '');
        const val = flagArgs[i + 1];
        if (key && val) flags[key] = val;
    }
    return flags;
}

function printUsage(): void {
    console.log(`
Usage: factory <command> [options]

Commands:
  build <spec.yaml>          Full pipeline: gather → validate → plan → build → test → iterate → push
  validate <spec.yaml>       Validate a spec
  status                     Show spec statuses
  sync <repo-path>           Sync .factory from repo
  init-bridge <repo-path>    Init .factory bridge in repo

  project add <repo-path>    Connect a repo
  project list               List connected repos
  project switch <id>        Switch active project
  project remove <id>        Disconnect a repo

  feature build <spec.yaml>     Build a feature
  feature validate <spec.yaml>  Validate a feature spec

  queue list                    List all queue items
  queue add <spec.yaml>         Add a spec to the queue
  queue start                   Process all pending items autonomously
  queue stats                   Show queue statistics
  queue clear                   Clear completed items
  queue retry <id>              Retry a failed item
  queue remove <id>             Remove an item from queue
`);
}

// ─── Run ─────────────────────────────────────────────────

main().catch(err => {
    logError(err.message || String(err));
    process.exit(1);
});
