/**
 * Test helpers.
 *
 * The `Executor` seam means almost every test runs without a real binary.
 */

import type { Executor, RawResult } from '../src/core/types.ts';

export interface RecordedCall {
  binary: string;
  argv: string[];
  options: Parameters<Executor>[2];
}

export interface FakeExecutor {
  executor: Executor;
  calls: RecordedCall[];
  /** argv of the most recent call. */
  lastArgv(): string[];
}

/** An executor that records calls and returns a canned result. */
export function fakeExecutor(result: Partial<RawResult> = {}): FakeExecutor {
  const calls: RecordedCall[] = [];

  const executor: Executor = (binary, argv, options) => {
    calls.push({ binary, argv, options });
    return Promise.resolve({
      exitCode: 0,
      stdout: '',
      stderr: '',
      signal: null,
      timedOut: false,
      durationMs: 0,
      ...result,
    });
  };

  return {
    executor,
    calls,
    lastArgv: () => calls.at(-1)?.argv ?? [],
  };
}
