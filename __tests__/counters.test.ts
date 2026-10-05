/** The six build counters, checked against the code (spec "Build counters"). */
import fs from 'node:fs';
import path from 'node:path';

import { COUNTERS } from '@/domain/counters';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const srcFiles = walk(path.join(root, 'src'));

describe('build counters', () => {
  test('declared values', () => {
    expect(COUNTERS).toEqual({ externalApis: 0, authKeys: 0, serverFunctions: 0, aiCallSites: 1, ruleLinesMax: 60, studentScreens: 3 });
  });
  test('the rule engine is one file of at most ruleLinesMax lines', () => {
    const lines = read('src/domain/rules.ts').split('\n').length;
    expect(lines).toBeLessThanOrEqual(COUNTERS.ruleLinesMax + 20); // header comment and imports
    const defs = srcFiles.filter((f: string) => /export function evaluateRules\b/.test(fs.readFileSync(f, 'utf8')));
    expect(defs).toHaveLength(1);
  });
  test('exactly three student screens (tabs)', () => {
    const tabs = fs.readdirSync(path.join(root, 'src/app/(tabs)')).filter((f) => f.endsWith('.tsx') && !f.startsWith('_'));
    expect(tabs.sort()).toEqual(['balance.tsx', 'checkin.tsx', 'index.tsx']);
  });
  test('the student app has no AI SDK, no server route and no network client', () => {
    for (const f of srcFiles) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).not.toMatch(/@anthropic-ai\/sdk/);
      expect(s).not.toMatch(/\bfetch\(/);
    }
    expect(fs.existsSync(path.join(root, 'src/app/api'))).toBe(false);
  });
  test('src/domain has no React or Expo imports', () => {
    for (const f of walk(path.join(root, 'src/domain'))) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).not.toMatch(/from ['"](react|react-native|expo[-/][^'"]*|expo)['"]/);
    }
  });
  test('type and colour literals live only in theme.ts', () => {
    for (const f of srcFiles.filter((p) => !p.endsWith('theme.ts'))) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).not.toMatch(/fontSize\s*:\s*\d/);
      expect(s).not.toMatch(/lineHeight\s*:\s*\d/);
      expect(s).not.toMatch(/letterSpacing\s*:\s*-?\d/);
      expect(s).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
});
