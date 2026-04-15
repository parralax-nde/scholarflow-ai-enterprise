// utils/colorUtils.js
export const hslToHex = (h: number, s: number, l: number) => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const MAX_PALETTE_GENERATION_ATTEMPTS = 32;

const hexChannelToLinear = (hexChannel: string) => {
  // WCAG sRGB gamma expansion to linear RGB.
  const value = parseInt(hexChannel, 16) / 255;
  if (value <= 0.03928) {
    return value / 12.92;
  }
  return ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  // WCAG relative luminance using Rec. 709 coefficients.
  const clean = hex.replace('#', '');
  const r = hexChannelToLinear(clean.slice(0, 2));
  const g = hexChannelToLinear(clean.slice(2, 4));
  const b = hexChannelToLinear(clean.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (colorA: string, colorB: string) => {
  // WCAG contrast ratio formula with +0.05 luminance offset.
  const l1 = luminance(colorA);
  const l2 = luminance(colorB);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
};

const pickReadableTextColor = (background: string) => {
  const blackContrast = contrastRatio(background, '#000000');
  const whiteContrast = contrastRatio(background, '#FFFFFF');
  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
};

const passesVisibilityRules = ({
  backgroundColor,
  textColor,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  backgroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}) => {
  // Keep backgrounds and UI accents visibly separated; text/background uses WCAG AAA (7:1).
  const bgContrastOk =
    contrastRatio(backgroundColor, primaryColor) >= 2.2 &&
    contrastRatio(backgroundColor, secondaryColor) >= 2.0 &&
    contrastRatio(backgroundColor, accentColor) >= 2.0;

  const textContrastOk =
    contrastRatio(textColor, backgroundColor) >= 7 &&
    contrastRatio(textColor, primaryColor) >= 2.2 &&
    contrastRatio(textColor, secondaryColor) >= 1.6 &&
    contrastRatio(textColor, accentColor) >= 1.6;

  const pairContrastOk =
    contrastRatio(primaryColor, secondaryColor) >= 1.15 &&
    contrastRatio(primaryColor, accentColor) >= 1.15 &&
    contrastRatio(secondaryColor, accentColor) >= 1.1;

  return bgContrastOk && textContrastOk && pairContrastOk;
};

export const randomColor = (isDarkMode: boolean) => {
  for (
    let attempt = 0;
    attempt < MAX_PALETTE_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 32) + 48;
    const bgLightness = isDarkMode
      ? Math.floor(Math.random() * 14) + 8
      : Math.floor(Math.random() * 14) + 84;
    const toneBase = isDarkMode
      ? Math.floor(Math.random() * 20) + 46
      : Math.floor(Math.random() * 22) + 30;

    const palette = {
      backgroundColor: hslToHex((hue + 180) % 360, saturation - 8, bgLightness),
      textColor: pickReadableTextColor(
        hslToHex((hue + 180) % 360, saturation - 8, bgLightness)
      ),
      primaryColor: hslToHex(hue, saturation + 8, toneBase),
      secondaryColor: hslToHex(
        (hue + 200 + Math.floor(Math.random() * 40)) % 360,
        Math.max(40, saturation - 6),
        isDarkMode ? toneBase + 6 : toneBase - 4
      ),
      accentColor: hslToHex(
        (hue + 55 + Math.floor(Math.random() * 22)) % 360,
        saturation + 12,
        isDarkMode ? toneBase + 10 : toneBase - 8
      ),
    };

    if (passesVisibilityRules(palette)) {
      return palette;
    }
  }

  const fallbackBackground = isDarkMode ? '#111827' : '#F8FAFC';
  return {
    backgroundColor: fallbackBackground,
    textColor: pickReadableTextColor(fallbackBackground),
    primaryColor: isDarkMode ? '#60A5FA' : '#1D4ED8',
    secondaryColor: isDarkMode ? '#22D3EE' : '#0F766E',
    accentColor: isDarkMode ? '#F472B6' : '#BE185D',
  };
};

export const hexToHsl = (hex: string) => {
  const r = parseInt(hex?.slice(1, 3), 16) / 255;
  const g = parseInt(hex?.slice(3, 5), 16) / 255;
  const b = parseInt(hex?.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  if (isNaN(h) || isNaN(s) || isNaN(l)) {
    return { h: 0, s: 0, l: 0 };
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

export const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return { r: 0, g: 0, b: 0 };
  }

  return { r, g, b };
};
