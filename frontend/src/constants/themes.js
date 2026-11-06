// Display palettes. `dark` decides which variant of each component is used;
// the colors themselves are remapped in index.css under html[data-palette="<id>"].
export const THEMES = [
  { id: 'light', label: 'Light', dark: false, swatch: ['#f8fafc', '#2563eb'] },
  { id: 'dark', label: 'Dark', dark: true, swatch: ['#0f172a', '#3b82f6'] },
  { id: 'midnight', label: 'Midnight Navy', dark: true, swatch: ['#0d1430', '#7c6cff'] },
  { id: 'ocean', label: 'Ocean Teal', dark: false, swatch: ['#f2f8f9', '#0d9488'] },
  { id: 'crimson', label: 'Crimson', dark: false, swatch: ['#faf7f7', '#dc2626'] },
  { id: 'contrast', label: 'High Contrast', dark: true, swatch: ['#000000', '#facc15'] },
];

export const DEFAULT_THEME = 'ocean';

export const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem('palette') || localStorage.getItem('theme');
    return THEMES.some(t => t.id === stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const storeTheme = (id) => {
  try { localStorage.setItem('palette', id); } catch { /* storage unavailable: keep for this session only */ }
};
