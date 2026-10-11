import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root = process.env.QA_SOURCE_ROOT ? path.resolve(process.env.QA_SOURCE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function portAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('Port 3000 already occupied. Stop the local app first; QA will not reuse or terminate an unknown server.')));
    probe.listen(3000, () => probe.close(() => resolve()));
  });
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    let escalation: ReturnType<typeof setTimeout>;
    let deadline: ReturnType<typeof setTimeout>;
    const finish = () => { clearTimeout(escalation); clearTimeout(deadline); resolve(); };
    child.once('exit', finish);
    escalation = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 3_000);
    deadline = setTimeout(() => {
      child.off('exit', finish);
      clearTimeout(escalation);
      reject(new Error('The QA-owned server did not exit after SIGTERM/SIGKILL; abort before reusing port 3000.'));
    }, 8_000);
    child.kill('SIGTERM');
  });
}
export const test = base.extend<{ appServer: string }>({
  appServer: [async ({}, use, testInfo) => {
    if (process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL) throw new Error('This suite only creates disposable local rooms. Remove external BASE_URL overrides.');
    const entry = path.join(root, 'server/dist/server/src/index.js');
    if (!existsSync(entry)) throw new Error('Build actual server first: from repository root run npm install && npm run build. Keep shipped client/dist; do not run build:client.');
    await portAvailable();
    const child = spawn(process.execPath, [entry], { cwd: path.join(root, 'server'), env: { ...process.env, PORT: '3000' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', chunk => { output += String(chunk); });
    child.stderr?.on('data', chunk => { output += String(chunk); });
    try {
      await expect.poll(async () => {
        if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}: ${output}`);
        try { const r = await fetch('http://localhost:3000'); return r.ok && (await r.text()).includes('screen-home'); } catch { return false; }
      }, { timeout: 15_000, message: 'Actual shipped client and server ready' }).toBe(true);
      await use('http://localhost:3000');
    } finally {
      await stop(child);
      await testInfo.attach('local-server-log', { body: output, contentType: 'text/plain' });
    }
  }, { auto: true }],
  baseURL: async ({ appServer }, use) => { await use(appServer); },
});
export { expect };
export const serverTest = test;
