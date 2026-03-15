import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// __dirname = apps/web/src/__tests__  →  ../.. = apps/web
const webRoot = path.resolve(__dirname, '../..');

describe('Playwright config meta', () => {
  it('playwright.config.ts exists and is non-empty', () => {
    const configPath = path.join(webRoot, 'playwright.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('defineConfig');
    expect(content).toContain('testDir');
    expect(content.length).toBeGreaterThan(100);
  });

  it('all e2e spec files contain at least one test() call', () => {
    const e2eDir = path.join(webRoot, 'e2e');
    expect(fs.existsSync(e2eDir)).toBe(true);

    const specFiles = fs
      .readdirSync(e2eDir)
      .filter((f) => f.endsWith('.spec.ts'));

    expect(specFiles.length).toBeGreaterThan(0);

    for (const file of specFiles) {
      const content = fs.readFileSync(path.join(e2eDir, file), 'utf-8');
      expect(
        content.includes('test(') || content.includes('test.describe('),
        `${file} should contain at least one test() or test.describe() call`
      ).toBe(true);
    }
  });
});
