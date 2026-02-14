/**
 * Projects — Multi-project manager for the factory.
 *
 * Stores a list of connected repos in projects.json at the factory root.
 * One project is active at a time; all spec/build operations target it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { writeFile, log } from './utils.ts';
import { initBridge, hasBridge, type BridgeConfig, loadBridgeConfig } from './bridge.ts';

// ─── Types ────────────────────────────────────────────────

export interface Project {
    id: string;
    name: string;
    path: string;
    addedAt: string;
}

export interface ProjectsConfig {
    activeProject: string | null;
    projects: Project[];
}

// ─── Paths ────────────────────────────────────────────────

const FACTORY_ROOT = resolve(import.meta.dirname || __dirname, '..');
const PROJECTS_FILE = join(FACTORY_ROOT, 'projects.json');

// ─── Public API ───────────────────────────────────────────

/**
 * Load the projects config, or create an empty one.
 */
export function loadProjects(): ProjectsConfig {
    if (!existsSync(PROJECTS_FILE)) {
        return { activeProject: null, projects: [] };
    }
    return JSON.parse(readFileSync(PROJECTS_FILE, 'utf-8'));
}

/**
 * Save the projects config to disk.
 */
function saveProjects(config: ProjectsConfig): void {
    writeFile(PROJECTS_FILE, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Add a new project.  Runs bridge init if needed.
 * Returns the created project.
 */
export function addProject(repoPath: string): { project: Project; bridge: BridgeConfig } {
    const absPath = resolve(repoPath);

    if (!existsSync(absPath)) {
        throw new Error(`Path does not exist: ${absPath}`);
    }

    const config = loadProjects();

    // Check for duplicates
    if (config.projects.some(p => p.path === absPath)) {
        throw new Error(`Project already connected: ${absPath}`);
    }

    // Init bridge (creates .factory/ if not present)
    const bridge = initBridge(absPath);

    // Create project entry
    const project: Project = {
        id: slugify(bridge.name),
        name: bridge.name,
        path: absPath,
        addedAt: new Date().toISOString(),
    };

    // Ensure unique id
    let id = project.id;
    let counter = 1;
    while (config.projects.some(p => p.id === id)) {
        id = `${project.id}-${counter++}`;
    }
    project.id = id;

    config.projects.push(project);

    // Set as active if it's the only project
    if (config.projects.length === 1) {
        config.activeProject = project.id;
    }

    saveProjects(config);
    log('✓', `Project "${project.name}" added (id: ${project.id})`);

    return { project, bridge };
}

/**
 * Remove a project by id.
 */
export function removeProject(id: string): void {
    const config = loadProjects();
    const idx = config.projects.findIndex(p => p.id === id);
    if (idx === -1) {
        throw new Error(`Project not found: ${id}`);
    }

    config.projects.splice(idx, 1);

    // If removed project was active, clear or switch
    if (config.activeProject === id) {
        config.activeProject = config.projects[0]?.id || null;
    }

    saveProjects(config);
    log('✓', `Project "${id}" removed`);
}

/**
 * Set the active project by id.
 */
export function setActiveProject(id: string): Project {
    const config = loadProjects();
    const project = config.projects.find(p => p.id === id);
    if (!project) {
        throw new Error(`Project not found: ${id}`);
    }

    config.activeProject = id;
    saveProjects(config);
    log('✓', `Active project set to "${project.name}"`);
    return project;
}

/**
 * Get the currently active project (throws if none).
 */
export function getActiveProject(): Project {
    const config = loadProjects();
    if (!config.activeProject) {
        throw new Error('No active project. Add a project first.');
    }
    const project = config.projects.find(p => p.id === config.activeProject);
    if (!project) {
        throw new Error(`Active project "${config.activeProject}" not found in projects list.`);
    }
    return project;
}

/**
 * List all projects, with a flag indicating which is active.
 */
export function listProjects(): { projects: Project[]; activeId: string | null } {
    const config = loadProjects();
    return { projects: config.projects, activeId: config.activeProject };
}

/**
 * Get the specs directory for the active project.
 */
export function getActiveSpecsDir(): { apps: string; features: string } {
    const project = getActiveProject();
    return {
        apps: join(project.path, '.factory', 'specs', 'apps'),
        features: join(project.path, '.factory', 'specs', 'features'),
    };
}

/**
 * Get the bridge config for the active project.
 */
export function getActiveBridgeConfig(): BridgeConfig {
    const project = getActiveProject();
    return loadBridgeConfig(project.path);
}

// ─── Helpers ──────────────────────────────────────────────

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
