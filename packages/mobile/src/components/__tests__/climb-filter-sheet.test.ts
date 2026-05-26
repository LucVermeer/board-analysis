import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sheetSource = readFileSync(join(__dirname, '..', 'ClimbFilterSheet.tsx'), 'utf-8');

describe('ClimbFilterSheet section order', () => {
  it('renders sections in the same order as the web app: Climb, Quality, Status, Progress', () => {
    const sectionPattern = /CollapsibleSection\s+title=\{t\('mobile\.filter\.section\.(\w+)'\)/g;
    const sections: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = sectionPattern.exec(sheetSource)) !== null) {
      sections.push(match[1]);
    }
    expect(sections).toEqual(['climb', 'quality', 'status', 'progress']);
  });

  it('only the Climb section has defaultExpanded', () => {
    const sectionPattern =
      /CollapsibleSection\s+title=\{t\('mobile\.filter\.section\.(\w+)'\)\}(\s+defaultExpanded)?/g;
    const expandedSections: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = sectionPattern.exec(sheetSource)) !== null) {
      if (match[2]) expandedSections.push(match[1]);
    }
    expect(expandedSections).toEqual(['climb']);
  });

  it('does not contain a standalone Sort section', () => {
    expect(sheetSource).not.toContain("title={t('mobile.filter.section.sort')}");
  });

  it('sort controls live inside the Climb section', () => {
    const climbStart = sheetSource.indexOf("title={t('mobile.filter.section.climb')}");
    const qualityStart = sheetSource.indexOf("title={t('mobile.filter.section.quality')}");
    const sortByRef = sheetSource.indexOf("t('mobile.filter.sortBy')");
    expect(sortByRef).toBeGreaterThan(climbStart);
    expect(sortByRef).toBeLessThan(qualityStart);
  });
});

describe('ClimbFilterSheet section state reset on re-open', () => {
  it('uses a key on the sections container that changes when the sheet opens', () => {
    expect(sheetSource).toContain('key={openCount}');
    expect(sheetSource).toMatch(/setOpenCount\(\s*\(c\)\s*=>\s*c\s*\+\s*1\s*\)/);
  });

  it('resets scroll position to top when sheet opens', () => {
    expect(sheetSource).toContain('scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false })');
  });
});

describe('ClimbFilterSheet uses BottomSheetScrollView', () => {
  it('imports BottomSheetScrollView from @gorhom/bottom-sheet', () => {
    expect(sheetSource).toContain('BottomSheetScrollView');
    expect(sheetSource).toMatch(/import\s[\s\S]*BottomSheetScrollView[\s\S]*from\s*'@gorhom\/bottom-sheet'/);
  });

  it('does not use a plain ScrollView as the main filter list', () => {
    expect(sheetSource).toContain('<BottomSheetScrollView');
    const mainScrollMatches = sheetSource.match(/<ScrollView[^>]*style=\{styles\.scrollView/g);
    expect(mainScrollMatches).toBeNull();
  });
});

describe('ClimbFilterSheet apply button is outside the scroll area', () => {
  it('footer with apply button appears after BottomSheetScrollView closes', () => {
    const scrollViewClose = sheetSource.lastIndexOf('</BottomSheetScrollView>');
    const footerStart = sheetSource.indexOf("style={styles.footer}");
    expect(footerStart).toBeGreaterThan(scrollViewClose);
  });
});
