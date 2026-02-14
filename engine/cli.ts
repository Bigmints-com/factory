#!/usr/bin/env node

/**
 * SaveADay Factory CLI
 *
 * Autonomous app scaffolding factory — works with any repo.
 *
 * Usage:
 *   factory scaffold <spec.yaml>         Scaffold a new app from spec
 *   factory validate <spec.yaml>         Validate a spec against schema
 *   factory validate-output <slug>       Validate a generated app
 *   factory patch <spec.yaml>            Generate integration patches
 *   factory report <spec.yaml>           Generate a build report
 *   factory sync <repo-path>             Sync reference from repo
 *   factory status                       Show task queue status
 *   factory build <spec.yaml>            Full pipeline
 *   factory feature build <spec.yaml>    Build a feature
 *   factory feature validate <spec.yaml> Validate a feature spec
 *   factory init-bridge <repo-path>      Init .factory bridge in a repo
 *   factory project add <repo-path>      Connect a repo
 *   factory project list                 List connected repos
 *   factory project switch <id>          Switch active project
 *   factory project remove <id>          Disconnect a repo
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { scaffoldApp } from './scaffold.ts';
import { customizeApp } from './customize.ts';
import { validateSpec, validateOutput, printValidation } from './validate.ts';
import { generatePatches } from './patch.ts';
import { generateReport } from './report.ts';
import { syncFromRepo } from './sync.ts';
import { PATHS, loadSpec, log } from './utils.ts';
import { validateFeatureSpec, printFeatureValidation } from './feature-validate.ts';
import { scaffoldFeature, generateFeatureReport } from './feature-scaffold.ts';
import { initBridge } from './bridge.ts';
import { addProject, removeProject, listProjects, setActiveProject } from './projects.ts';
import type { AppSpec, FeatureSpec } from './types.ts';

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

async function main(): Promise<void> {
    console.log('');
    console.log('🏭 SaveADay Factory');
    console.log('─'.repeat(40));
    console.log('');

    switch (command) {
        case 'scaffold':
            return handleScaffold(target);
        case 'validate':
            return handleValidate(target);
        case 'validate-output':
            return handleValidateOutput(target);
        case 'patch':
            return handlePatch(target);
        case 'report':
            return handleReport(target);
        case 'sync':
            return handleSync(target);
        case 'status':
            return handleStatus();
        case 'build':
            return handleBuild(target);
        case 'feature':
            return handleFeature(target, args[2]);
        case 'init-bridge':
            return handleInitBridge(target);
        case 'project':
            return handleProject(target, args[2]);
        default:
            printUsage();
            process.exit(command ? 1 : 0);
    }
}

function requireTarget(cmd: string): void {
    if (!target) {
        console.error(`Error: ${cmd} requires an argument.`);
        console.error(`Usage: factory ${cmd} <${cmd === 'sync' ? 'repo-path' : cmd === 'validate-output' ? 'slug' : 'spec.yaml'}>`);
        process.exit(1);
    }
}

function handleScaffold(specPath?: string): void {
    requireTarget('scaffold');
    const spec = loadSpec(specPath!);

    log('●', `Scaffolding ${spec.metadata.name} (${spec.metadata.slug})...`);

    // Validate first
    const validation = validateSpec(spec);
    if (!validation.passed) {
        log('✗', 'Spec validation failed:');
        printValidation(validation);
        process.exit(1);
    }

    // Scaffold
    const outputDir = scaffoldApp(spec);

    // Customize
    customizeApp(outputDir, spec);

    log('✓', `App scaffolded at: ${outputDir}`);
    log('→', `Next: run 'factory patch ${specPath}' to generate integration patches`);
}

function handleValidate(specPath?: string): void {
    requireTarget('validate');
    const spec = loadSpec(specPath!);

    log('●', `Validating spec: ${spec.metadata.slug}...`);
    const result = validateSpec(spec);
    printValidation(result);

    process.exit(result.passed ? 0 : 1);
}

function handleValidateOutput(slug?: string): void {
    requireTarget('validate-output');

    log('●', `Validating output: ${slug}...`);
    const result = validateOutput(slug!);
    printValidation(result);

    process.exit(result.passed ? 0 : 1);
}

function handlePatch(specPath?: string): void {
    requireTarget('patch');
    const spec = loadSpec(specPath!);

    log('●', `Generating patches for ${spec.metadata.slug}...`);
    generatePatches(spec);
}

function handleReport(specPath?: string): void {
    requireTarget('report');
    const spec = loadSpec(specPath!);

    log('●', `Generating report for ${spec.metadata.slug}...`);

    const outputValidation = validateOutput(spec.metadata.slug);
    const specValidation = validateSpec(spec);

    // Merge validations
    const combined = {
        passed: outputValidation.passed && specValidation.passed,
        checks: [...specValidation.checks, ...outputValidation.checks],
    };

    generateReport(spec, combined);
}

function handleSync(repoPath?: string): void {
    requireTarget('sync');
    const absPath = resolve(repoPath!);

    log('●', `Syncing reference from ${absPath}...`);
    syncFromRepo(absPath);
}

function handleStatus(): void {
    log('●', 'Task Queue Status');
    console.log('');

    if (!existsSync(PATHS.specs)) {
        log('!', 'No specs/ directory found.');
        return;
    }

    const specFiles = readdirSync(PATHS.specs).filter(
        f => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    if (specFiles.length === 0) {
        log('!', 'No spec files found in specs/');
        return;
    }

    const statusIcons: Record<string, string> = {
        'draft': '📝',
        'ready': '🟢',
        'in-progress': '🔄',
        'validation': '🔍',
        'review': '👀',
        'done': '✅',
    };

    console.log('| Status | Slug | Name | Port |');
    console.log('|--------|------|------|------|');

    for (const file of specFiles) {
        if (file.startsWith('_')) continue; // Skip example files in table

        try {
            const content = readFileSync(resolve(PATHS.specs, file), 'utf-8');
            const spec = parseYaml(content) as AppSpec;
            const icon = statusIcons[spec.status] || '❓';
            console.log(`| ${icon} ${spec.status} | ${spec.metadata.slug} | ${spec.metadata.name} | ${spec.deployment.port} |`);
        } catch {
            console.log(`| ❌ error | ${basename(file)} | Failed to parse | - |`);
        }
    }

    console.log('');
}

function handleBuild(specPath?: string): void {
    requireTarget('build');
    const spec = loadSpec(specPath!);

    console.log(`🏭 Full Build Pipeline: ${spec.metadata.name}`);
    console.log('═'.repeat(50));
    console.log('');

    // Step 1: Validate spec
    log('●', '[1/5] Validating spec...');
    const specValidation = validateSpec(spec);
    if (!specValidation.passed) {
        log('✗', 'Spec validation failed:');
        printValidation(specValidation);
        process.exit(1);
    }
    log('✓', 'Spec is valid.');
    console.log('');

    // Step 2: Scaffold
    log('●', '[2/5] Scaffolding app...');
    const outputDir = scaffoldApp(spec);
    console.log('');

    // Step 3: Customize
    log('●', '[3/5] Customizing app...');
    customizeApp(outputDir, spec);
    console.log('');

    // Step 4: Generate patches
    log('●', '[4/5] Generating patches...');
    generatePatches(spec);
    console.log('');

    // Step 5: Validate output + generate report
    log('●', '[5/5] Validating output & generating report...');
    const outputValidation = validateOutput(spec.metadata.slug);
    const combined = {
        passed: outputValidation.passed && specValidation.passed,
        checks: [...specValidation.checks, ...outputValidation.checks],
    };
    const report = generateReport(spec, combined);
    console.log('');

    // Summary
    console.log('═'.repeat(50));
    if (combined.passed) {
        log('✓', `BUILD COMPLETE: ${spec.metadata.name}`);
    } else {
        log('!', `BUILD COMPLETE WITH WARNINGS: ${spec.metadata.name}`);
    }
    log('→', `Output: output/${spec.metadata.slug}/`);
    log('→', `Patches: output/${spec.metadata.slug}/patches/`);
    log('→', `Report: reports/${spec.metadata.slug}-*.md`);
    console.log('');
}

// ─── Feature Commands ────────────────────────────────────

function loadFeatureSpec(specPath: string): FeatureSpec {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) {
        console.error(`Error: Feature spec not found: ${absPath}`);
        process.exit(1);
    }
    const content = readFileSync(absPath, 'utf-8');
    return parseYaml(content) as FeatureSpec;
}

function handleFeature(subcommand?: string, specPath?: string): void {
    if (!subcommand || !['build', 'validate'].includes(subcommand)) {
        console.error('Usage: factory feature <build|validate> <feature-spec.yaml>');
        process.exit(1);
    }
    if (!specPath) {
        console.error(`Error: factory feature ${subcommand} requires a spec file.`);
        process.exit(1);
    }

    switch (subcommand) {
        case 'validate':
            return handleFeatureValidate(specPath);
        case 'build':
            return handleFeatureBuild(specPath);
    }
}

function handleFeatureValidate(specPath: string): void {
    const spec = loadFeatureSpec(specPath);

    log('●', `Validating feature spec: ${spec.feature?.slug || 'unknown'}...`);
    const result = validateFeatureSpec(spec);
    printFeatureValidation(result);

    process.exit(result.passed ? 0 : 1);
}

function handleFeatureBuild(specPath: string): void {
    const spec = loadFeatureSpec(specPath);

    console.log(`🏭 Feature Build: ${spec.feature.name}`);
    console.log(`   Target app: ${spec.target.app}`);
    console.log('═'.repeat(50));
    console.log('');

    // Step 1: Validate
    log('●', '[1/3] Validating feature spec...');
    const validation = validateFeatureSpec(spec);
    if (!validation.passed) {
        log('✗', 'Feature spec validation failed:');
        printFeatureValidation(validation);
        process.exit(1);
    }
    log('✓', 'Feature spec is valid.');
    console.log('');

    // Step 2: Scaffold feature
    log('●', '[2/3] Generating feature files...');
    const { outputDir, files } = scaffoldFeature(spec);
    console.log('');

    // Step 3: Generate report
    log('●', '[3/3] Generating report...');
    const report = generateFeatureReport(spec, files);
    console.log('');

    // Summary
    console.log('═'.repeat(50));
    log('✓', `FEATURE BUILD COMPLETE: ${spec.feature.name}`);
    log('→', `Output: ${outputDir}`);
    log('→', `Files generated: ${files.length}`);
    log('→', `Apply instructions: ${outputDir}/APPLY.md`);
    console.log('');
}

// ─── Init Bridge & Project Commands ──────────────────────

function handleInitBridge(repoPath?: string): void {
    requireTarget('init-bridge');
    const absPath = resolve(repoPath!);
    log('●', `Initialising .factory bridge in ${absPath}...`);
    initBridge(absPath);
}

function handleProject(subcommand?: string, arg?: string): void {
    if (!subcommand) {
        console.error('Usage: factory project <add|list|switch|remove> [argument]');
        process.exit(1);
    }

    switch (subcommand) {
        case 'add': {
            if (!arg) { console.error('Usage: factory project add <repo-path>'); process.exit(1); }
            const { project, bridge } = addProject(arg);
            log('✓', `Connected: ${project.name} (${project.path})`);
            break;
        }
        case 'list': {
            const { projects, activeId } = listProjects();
            if (projects.length === 0) {
                log('!', 'No projects connected. Run: factory project add <path>');
            } else {
                console.log('');
                for (const p of projects) {
                    const marker = p.id === activeId ? '● ' : '  ';
                    console.log(`${marker}${p.name} (${p.id})`);
                    console.log(`    ${p.path}`);
                }
                console.log('');
            }
            break;
        }
        case 'switch': {
            if (!arg) { console.error('Usage: factory project switch <id>'); process.exit(1); }
            setActiveProject(arg);
            break;
        }
        case 'remove': {
            if (!arg) { console.error('Usage: factory project remove <id>'); process.exit(1); }
            removeProject(arg);
            break;
        }
        default:
            console.error(`Unknown project subcommand: ${subcommand}`);
            process.exit(1);
    }
}

function printUsage(): void {
    console.log('Usage: factory <command> [arguments]');
    console.log('');
    console.log('App Commands:');
    console.log('  build <spec.yaml>                    Full pipeline: validate → scaffold → customize → patch → report');
    console.log('  scaffold <spec.yaml>                 Scaffold a new app from spec');
    console.log('  validate <spec.yaml>                 Validate a spec against schema');
    console.log('  validate-output <slug>               Validate a generated app directory');
    console.log('  patch <spec.yaml>                    Generate integration patches');
    console.log('  report <spec.yaml>                   Generate a build report');
    console.log('  sync <repo-path>                     Sync reference from repo');
    console.log('  status                               Show task queue status');
    console.log('');
    console.log('Feature Commands:');
    console.log('  feature build <feature-spec.yaml>    Build a feature into an existing app');
    console.log('  feature validate <feature-spec.yaml> Validate a feature spec');
    console.log('');
    console.log('Project Commands:');
    console.log('  init-bridge <repo-path>              Init .factory bridge in a repo');
    console.log('  project add <repo-path>              Connect a repo as a project');
    console.log('  project list                         List connected projects');
    console.log('  project switch <id>                  Switch active project');
    console.log('  project remove <id>                  Disconnect a project');
    console.log('');
}

main().catch((err: Error) => {
    log('✗', `Error: ${err.message}`);
    process.exit(1);
});
