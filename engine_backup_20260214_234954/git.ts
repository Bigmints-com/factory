/**
 * Git — Branch management for factory builds.
 *
 * Instead of writing to an output/ directory, the factory creates a
 * feature branch in the target repo, writes files directly, and commits.
 * The user reviews the branch and merges when ready.
 */

import { execSync } from 'node:child_process';
import { log } from './utils.ts';

// ─── Types ────────────────────────────────────────────────

export interface BranchResult {
    branch: string;
    originalBranch: string;
    repoPath: string;
}

export interface CommitResult {
    branch: string;
    message: string;
    filesChanged: number;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(repoPath: string): string {
    return git(repoPath, 'rev-parse --abbrev-ref HEAD').trim();
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export function isWorkingTreeClean(repoPath: string): boolean {
    const status = git(repoPath, 'status --porcelain');
    return status.trim() === '';
}

/**
 * Create a new build branch from current HEAD.
 * Branch name: factory/<slug>-<timestamp>
 */
export function createBuildBranch(repoPath: string, specSlug: string): BranchResult {
    const originalBranch = getCurrentBranch(repoPath);

    // Check for uncommitted changes
    if (!isWorkingTreeClean(repoPath)) {
        log('!', 'Warning: Working tree has uncommitted changes — stashing...');
        git(repoPath, 'stash push -m "factory-auto-stash"');
    }

    // Generate branch name
    const timestamp = Math.floor(Date.now() / 1000);
    const branch = `factory/${specSlug}-${timestamp}`;

    // Create and switch to the new branch
    git(repoPath, `checkout -b ${branch}`);
    log('✓', `Created branch: ${branch}`);

    return { branch, originalBranch, repoPath };
}

/**
 * Stage and commit all changes with a factory-tagged message.
 */
export function commitBuildOutput(
    repoPath: string,
    message: string
): CommitResult {
    const branch = getCurrentBranch(repoPath);

    // Stage all changes
    git(repoPath, 'add -A');

    // Check if there's anything to commit
    const status = git(repoPath, 'status --porcelain');
    const filesChanged = status.trim().split('\n').filter(l => l.trim()).length;

    if (filesChanged === 0) {
        log('!', 'No files changed — nothing to commit');
        return { branch, message, filesChanged: 0 };
    }

    // Commit
    const commitMsg = `🏭 Factory: ${message}`;
    git(repoPath, `commit -m "${commitMsg}"`);
    log('✓', `Committed ${filesChanged} files: "${commitMsg}"`);

    return { branch, message: commitMsg, filesChanged };
}

/**
 * Switch back to the original branch after a build.
 */
export function switchBack(repoPath: string, originalBranch: string): void {
    git(repoPath, `checkout ${originalBranch}`);

    // Pop stash if we stashed earlier
    try {
        const stashList = git(repoPath, 'stash list');
        if (stashList.includes('factory-auto-stash')) {
            git(repoPath, 'stash pop');
            log('✓', 'Restored stashed changes');
        }
    } catch {
        // No stash to pop, that's fine
    }

    log('✓', `Switched back to ${originalBranch}`);
}

/**
 * Delete a factory branch (cleanup).
 */
export function deleteBranch(repoPath: string, branch: string): void {
    if (!branch.startsWith('factory/')) {
        throw new Error(`Refusing to delete non-factory branch: ${branch}`);
    }
    git(repoPath, `branch -D ${branch}`);
    log('✓', `Deleted branch: ${branch}`);
}

/**
 * List all factory branches in a repo.
 */
export function listFactoryBranches(repoPath: string): string[] {
    const output = git(repoPath, 'branch --list "factory/*"');
    return output
        .split('\n')
        .map(l => l.trim().replace(/^\*\s*/, ''))
        .filter(l => l.length > 0);
}

/**
 * Get the diff summary between a factory branch and main.
 */
export function getBranchDiff(repoPath: string, branch: string): string {
    const mainBranch = getDefaultBranch(repoPath);
    return git(repoPath, `diff --stat ${mainBranch}..${branch}`);
}

// ─── Internal ─────────────────────────────────────────────

function git(repoPath: string, cmd: string): string {
    return execSync(`git -C "${repoPath}" ${cmd}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

function getDefaultBranch(repoPath: string): string {
    try {
        // Try to find main or master
        const branches = git(repoPath, 'branch --list');
        if (branches.includes('main')) return 'main';
        if (branches.includes('master')) return 'master';
    } catch { /* ignore */ }
    return 'main';
}
