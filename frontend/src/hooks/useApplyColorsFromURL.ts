import { useEffect } from 'react';
import { setColors } from 'state/globalSlice';
import { useAppDispatch } from 'store/store-hooks';

const COLOR_KEYS = [
  'textColor',
  'backgroundColor',
  'primaryColor',
  'secondaryColor',
  'accentColor',
] as const;

const isHex = (value: string) => /^[0-9a-fA-F]{6}$/.test(value);

const useApplyColorsFromURL = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const query = new URLSearchParams(window.location.search).get('colors');
    if (!query) return;

    const values = query.split('-');
    if (values.length !== COLOR_KEYS.length || values.some((value) => !isHex(value))) {
      return;
    }

    const parsedColors = COLOR_KEYS.reduce((acc, key, index) => {
      acc[key] = {
        color: `#${values[index]}`,
        isLocked: false,
      };
      return acc;
    }, {} as Record<(typeof COLOR_KEYS)[number], { color: string; isLocked: boolean }>);

    dispatch(setColors(parsedColors));
  }, [dispatch]);
};

export default useApplyColorsFromURL;
