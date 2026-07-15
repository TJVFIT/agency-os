import { spawn } from 'node:child_process';

/**
 * Spawn a CLI and resolve its stdout, rejecting on a non-zero exit with the
 * stderr tail. Shared by the media handlers (ffmpeg/ffprobe) and the
 * transcription engines. A missing binary rejects with err.code='ENOENT' —
 * callers can use isMissingBinary() to fall back to another tool.
 */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 300)}`)),
    );
  });
}

export function isMissingBinary(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
