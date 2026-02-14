/**
 * Structured logging for the Factory engine.
 * Single place — no raw console.log anywhere else.
 */

const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
} as const;

const PREFIX_COLORS: Record<string, string> = {
    '●': COLORS.blue,
    '→': COLORS.cyan,
    '✓': COLORS.green,
    '✗': COLORS.red,
    '!': COLORS.yellow,
    '  ': COLORS.dim,
};

/**
 * Log a message with a colored prefix.
 */
export function log(prefix: string, message: string): void {
    const color = PREFIX_COLORS[prefix] || COLORS.white;
    console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

/**
 * Log a pipeline step: [2/5] Validating spec...
 */
export function logStep(current: number, total: number, message: string): void {
    console.log('');
    log('●', `[${current}/${total}] ${message}`);
}

/**
 * Log a header with separator.
 */
export function logHeader(title: string): void {
    console.log('');
    console.log(`${COLORS.bold}🏭 ${title}${COLORS.reset}`);
    console.log('─'.repeat(50));
    console.log('');
}

/**
 * Log an error.
 */
export function logError(message: string): void {
    log('✗', `${COLORS.red}${message}${COLORS.reset}`);
}
