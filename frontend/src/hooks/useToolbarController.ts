import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { openDialog } from 'state/dialogSlice';
import { randomizeColors, toggleDarkMode } from 'state/globalSlice';
import { useAppDispatch } from 'store/store-hooks';

const useToolbarController = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const url = window.location.href;
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tagName = element.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        element.isContentEditable
      );
    };
    const isToolbarVisible = () =>
      Array.from(document.querySelectorAll('[data-toolbar-hotkeys="enabled"]')).some(
        (node) => {
          const element = node as HTMLElement;
          return (
            element.getClientRects().length > 0 &&
            window.getComputedStyle(element).visibility !== 'hidden'
          );
        }
      );

    const handleToggleDarkMode = () => {
      dispatch(toggleDarkMode());
    };
    const handleRandomizeColors = () => {
      dispatch(randomizeColors());
    };
    const handleOpenDialog = () => {
      dispatch(openDialog('EXPORT_DIALOG'));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === ' ') {
        if (!isToolbarVisible()) return;
        e.preventDefault();
        handleRandomizeColors();
      }
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        handleToggleDarkMode();
      }
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        handleOpenDialog();
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        navigator.clipboard.writeText(url);
        toast.success('Copied to clipboard!');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
};

export default useToolbarController;
