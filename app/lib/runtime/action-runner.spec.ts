import { describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';

const startAction = {
  artifactId: 'artifact',
  messageId: 'message',
  actionId: 'start',
  action: { type: 'start' as const, content: 'npm run dev' },
};

function createRunner(installed: boolean) {
  const fs = {
    readFile: vi.fn(async (path: string) => {
      if (path === 'package.json') {
        return JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^6.0.0' } });
      }

      if (path === 'node_modules/vite/package.json' && installed) {
        return JSON.stringify({ name: 'vite' });
      }

      throw new Error('Missing file');
    }),
    readdir: vi.fn(async () => {
      if (!installed) {
        throw new Error('Missing directory');
      }

      return ['vite'];
    }),
  };
  const shell = {
    ready: vi.fn().mockResolvedValue(undefined),
    terminal: {},
    process: {},
    executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: '' }),
  };
  const runner = new ActionRunner(Promise.resolve({ fs } as never), () => shell as never);

  return { runner, shell };
}

describe('ActionRunner start dependencies', () => {
  it('installs missing dependencies before starting a generated app', async () => {
    const { runner, shell } = createRunner(false);

    runner.addAction(startAction);
    await runner.runAction(startAction);

    expect(shell.executeCommand.mock.calls.map(([, command]) => command)).toEqual([
      'npm install --no-audit --no-fund',
      'npm run dev',
    ]);
  });

  it('starts without reinstalling when Vite is already present', async () => {
    const { runner, shell } = createRunner(true);

    runner.addAction(startAction);
    await runner.runAction(startAction);

    expect(shell.executeCommand.mock.calls.map(([, command]) => command)).toEqual(['npm run dev']);
  });

  it('does not start the app when dependency installation fails', async () => {
    const { runner, shell } = createRunner(false);
    shell.executeCommand.mockResolvedValueOnce({ exitCode: 1, output: 'registry unavailable' });

    runner.addAction(startAction);
    await runner.runAction(startAction);

    expect(shell.executeCommand.mock.calls.map(([, command]) => command)).toEqual(['npm install --no-audit --no-fund']);
    expect(runner.actions.get().start.status).toBe('failed');
  });
});
