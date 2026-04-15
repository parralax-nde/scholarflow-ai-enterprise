import { useEffect } from 'react';
import { closeColorPickers, randomizeColors } from 'state/globalSlice';
import { useAppDispatch, useAppSelector } from 'store/store-hooks';

import useApplyColorsFromURL from '@/hooks/useApplyColorsFromURL';
import useToolbarController from '@/hooks/useToolbarController';
import useUpdateURL from '@/hooks/useUpdateURL';

const useOnLoad = () => {
  const colors = useAppSelector((state) => state.global.colors);
  const dispatch = useAppDispatch();
  const colorPickers = useAppSelector((state) => state.global.colorPickers);
  const isColorPickerOpen = Object.values(colorPickers).some(
    (colorPicker) => colorPicker
  );

  useApplyColorsFromURL();
  useUpdateURL();
  useToolbarController();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasColorsQuery = Boolean(
      new URLSearchParams(window.location.search).get('colors')
    );
    if (!hasColorsQuery) {
      dispatch(randomizeColors());
    }
  }, [dispatch]);

  const handleCloseColorPickers = () => {
    if (isColorPickerOpen) {
      dispatch(closeColorPickers());
    }
  };

  return {
    colors,
    handleCloseColorPickers,
  };
};

export default useOnLoad;
