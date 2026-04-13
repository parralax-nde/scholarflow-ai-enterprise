// ScholarFlow Design System
// Built from modern research interface principles

export const colors = {
  // Primary brand
  primary: '#6366f1',      // Indigo
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',

  // Research accent
  research: '#d97706',     // Amber/Gold
  researchLight: '#fbbf24',
  researchDark: '#b45309',

  // Semantic
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Neutrals
  white: '#ffffff',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Background
  background: '#ffffff',
  backgroundAlt: '#f9fafb',
  border: '#e5e7eb',
  shadow: 'rgba(0, 0, 0, 0.05)',
};

export const typography = {
  // Headings
  h1: {
    fontSize: '2rem',
    lineHeight: '2.5rem',
    fontWeight: 700,
  },
  h2: {
    fontSize: '1.5rem',
    lineHeight: '2rem',
    fontWeight: 600,
  },
  h3: {
    fontSize: '1.25rem',
    lineHeight: '1.75rem',
    fontWeight: 600,
  },
  h4: {
    fontSize: '1.125rem',
    lineHeight: '1.5rem',
    fontWeight: 600,
  },

  // Body text
  body: {
    fontSize: '1rem',
    lineHeight: '1.5rem',
    fontWeight: 400,
  },
  bodySmall: {
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    fontWeight: 400,
  },
  bodySemibold: {
    fontSize: '1rem',
    lineHeight: '1.5rem',
    fontWeight: 500,
  },

  // Labels
  label: {
    fontSize: '0.75rem',
    lineHeight: '1rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },

  // Monospace (for code)
  mono: {
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    fontWeight: 400,
    fontFamily: '"Courier New", monospace',
  },
};

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  xxl: '3rem',
};

export const borderRadius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
};

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  xxl: '1536px',
};

export const transitions = {
  fast: '150ms ease-in-out',
  base: '250ms ease-in-out',
  slow: '350ms ease-in-out',
};
