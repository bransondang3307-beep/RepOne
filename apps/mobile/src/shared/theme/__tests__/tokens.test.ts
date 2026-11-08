import { darkPalette, lightPalette, type Palette } from '../tokens';

/** WCAG relative luminance contrast ratio of two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
] as const)('%s palette', (_name, p: Palette) => {
  it('defines every token as a #RRGGBB color', () => {
    expect(Object.keys(p).sort()).toEqual(Object.keys(lightPalette).sort());
    for (const value of Object.values(p)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it.each([
    ['text', 'background'],
    ['text', 'surface'],
    ['textMuted', 'surface'],
    ['onPrimary', 'primary'],
    ['onDanger', 'danger'],
    ['primaryText', 'primarySoft'],
    ['primaryText', 'background'],
    ['textMuted', 'background'],
    ['danger', 'background'],
    ['fullText', 'background'],
    ['warningText', 'warningBg'],
    ['fullText', 'fullSoft'],
  ] as const)('keeps %s on %s readable (contrast ≥ 4.5:1)', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
