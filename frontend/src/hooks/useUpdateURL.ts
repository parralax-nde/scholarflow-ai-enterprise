import { useEffect } from 'react';
import { useAppSelector } from 'store/store-hooks';

const useUpdateURL = () => {
  const colors = useAppSelector((state) => state.global.colors);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const values = [
      colors.textColor.color,
      colors.backgroundColor.color,
      colors.primaryColor.color,
      colors.secondaryColor.color,
      colors.accentColor.color,
    ];

    if (values.some((value) => typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))) {
      return;
    }

    const url = new URL(window.location.href);
    const queryValue = (values as string[])
      .map((value) => value.replace('#', ''))
      .join('-');
    url.searchParams.set('colors', queryValue);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  }, [colors]);
};

export default useUpdateURL;
