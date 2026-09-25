// Minimal test harness for code that needs GJS (gi:// imports), which Vitest cannot run.
import GLib from 'gi://GLib';

type TestFn = () => void | Promise<void>;

interface Suite {
    name: string;
    tests: { name: string; fn: TestFn }[];
}

const suites: Suite[] = [];
let current: Suite | null = null;

export function describe(name: string, body: () => void): void {
    current = { name, tests: [] };
    suites.push(current);
    body();
    current = null;
}

export function it(name: string, fn: TestFn): void {
    if (!current) {
        throw new Error('it() must be called inside describe()');
    }
    current.tests.push({ name, fn });
}

class AssertionError extends Error {}

function format(value: unknown): string {
    return value instanceof Uint8Array ? `Uint8Array[${[...value].join(', ')}]` : JSON.stringify(value);
}

function normalise(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value, (_key, v) => (v instanceof Uint8Array ? [...v] : v)));
}

export function expect(actual: unknown) {
    const fail = (message: string): never => {
        throw new AssertionError(message);
    };
    return {
        toBe(expected: unknown) {
            if (actual !== expected) fail(`expected ${format(actual)} to be ${format(expected)}`);
        },
        toEqual(expected: unknown) {
            if (JSON.stringify(normalise(actual)) !== JSON.stringify(normalise(expected))) {
                fail(`expected ${format(actual)} to equal ${format(expected)}`);
            }
        },
        toBeTruthy() {
            if (!actual) fail(`expected ${format(actual)} to be truthy`);
        },
        toBeGreaterThan(expected: number) {
            if (!(typeof actual === 'number' && actual > expected)) fail(`expected ${format(actual)} > ${expected}`);
        },
        async toReject(match?: RegExp) {
            try {
                await (actual as Promise<unknown>);
            } catch (e) {
                if (match && !match.test(String(e))) fail(`rejected with ${e}, expected ${match}`);
                return;
            }
            fail('expected the promise to reject');
        },
    };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }),
    );
}

/** Waits until `predicate` holds, polling the main loop; fails after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
    const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
    while (!predicate()) {
        if (GLib.get_monotonic_time() > deadline) {
            throw new AssertionError(`timed out waiting for ${what}`);
        }
        await sleep(5);
    }
}

/** Runs every registered test and returns the number of failures. */
export async function run(): Promise<number> {
    let passed = 0;
    let failed = 0;
    for (const suite of suites) {
        print(suite.name);
        for (const test of suite.tests) {
            try {
                await test.fn();
                passed++;
                print(`  ✓ ${test.name}`);
            } catch (e) {
                failed++;
                print(`  ✗ ${test.name}\n      ${e instanceof Error ? e.message : e}`);
                if (!(e instanceof AssertionError) && e instanceof Error && e.stack) {
                    print(e.stack.split('\n').map(l => `      ${l}`).join('\n'));
                }
            }
        }
    }
    print(`\n${passed} passed, ${failed} failed`);
    return failed;
}
