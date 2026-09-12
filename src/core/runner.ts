/**
 * The one generic process runner.
 *
 * Commands are spawned without a shell, so no argument is ever interpolated
 * into a command string. The runner reports what happened; policy decisions
 * (non-zero exit, timeout handling, output parsing) belong to the client, so a
 * custom `Executor` only has to return a {@link RawResult}.
 */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { CLIBinaryNotFoundError, CLISpawnError } from './errors.ts';
import type { Executor, RawResult, ResolvedRunOptions } from './types.ts';

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

interface Collector {
  push(chunk: Buffer): void;
  text(): string;
  overflowed: boolean;
}

function createCollector(maxBuffer: number): Collector {
  const chunks: Buffer[] = [];
  let size = 0;
  const collector: Collector = {
    overflowed: false,
    push(chunk) {
      size += chunk.length;
      if (size > maxBuffer) {
        collector.overflowed = true;
        return;
      }
      chunks.push(chunk);
    },
    text() {
      return Buffer.concat(chunks).toString('utf8');
    },
  };
  return collector;
}

/**
 * Spawn a child process and capture its output.
 *
 * Resolves with a {@link RawResult} for any exit code; rejects only when the
 * process could not be run at all.
 */
export const spawnExecutor: Executor = async (
  binary: string,
  argv: string[],
  options: ResolvedRunOptions,
): Promise<RawResult> => {
  const startedAt = Date.now();
  const maxBuffer = options.maxBuffer > 0 ? options.maxBuffer : DEFAULT_MAX_BUFFER;

  return await new Promise<RawResult>((resolve, reject) => {
    const child = spawn(binary, argv, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout = createCollector(maxBuffer);
    const stderr = createCollector(maxBuffer);
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const context = { binary, argv, cwd: options.cwd };

    const finish = (result: RawResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    };

    if (options.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill(options.killSignal);
      }, options.timeout);
      timer.unref?.();
    }

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        fail(
          new CLIBinaryNotFoundError(
            `Executable "${binary}" was not found. Is it installed and on PATH?`,
            context,
            { cause: error },
          ),
        );
        return;
      }
      if (error.code === 'EACCES') {
        fail(
          new CLIBinaryNotFoundError(`Executable "${binary}" is not executable (EACCES).`, context, {
            cause: error,
          }),
        );
        return;
      }
      fail(new CLISpawnError(`Failed to run "${binary}": ${error.message}`, context, { cause: error }));
    });

    child.on('close', (code, signal) => {
      if (stdout.overflowed || stderr.overflowed) {
        fail(
          new CLISpawnError(
            `Output of "${binary}" exceeded maxBuffer (${maxBuffer} bytes).`,
            { ...context, exitCode: code ?? undefined, signal },
          ),
        );
        return;
      }

      finish({
        exitCode: code ?? -1,
        stdout: stdout.text(),
        stderr: stderr.text(),
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    if (child.stdin) {
      child.stdin.on('error', () => {
        // The child may exit before stdin is consumed; the close handler reports it.
      });
      if (options.stdin !== undefined) child.stdin.end(options.stdin);
      else child.stdin.end();
    }
  });
};
