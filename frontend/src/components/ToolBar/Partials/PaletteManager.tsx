import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { setColors } from 'state/globalSlice';
import { useAppDispatch, useAppSelector } from 'store/store-hooks';

import { toApiUrl } from '@/lib/api';
import { readAuthSession } from '@/lib/auth';

type SavedPalette = {
  id: string;
  name: string;
  colors: IColors;
  created_at: string;
  updated_at: string;
};

const PaletteManager: React.FC = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const colors = useAppSelector((state) => state.global.colors);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [palettes, setPalettes] = useState<SavedPalette[]>([]);

  const canSave = useMemo(() => name.trim().length > 0 && !loading, [name, loading]);

  const authHeaders = (): Record<string, string> => {
    const token = readAuthSession()?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  };

  const loadPalettes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(toApiUrl('/colors/palettes'), {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('Failed to load palettes');
      const payload = (await response.json()) as SavedPalette[];
      setPalettes(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(toApiUrl('/colors/palettes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: name.trim(), colors }),
      });
      if (!response.ok) throw new Error('Failed to save palette');
      setName('');
      await loadPalettes();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const handleDelete = async (paletteId: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(toApiUrl(`/colors/palettes/${paletteId}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete palette');
      await loadPalettes();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const handleApply = (palette: SavedPalette) => {
    dispatch(setColors(palette.colors));
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadPalettes().catch((err: unknown) =>
      setError((err as Error)?.message || 'Failed to load palettes')
    );
  }, [isOpen, loadPalettes]);

  return (
    <div className='relative' onClick={(event) => event.stopPropagation()}>
      <button
        type='button'
        className='flex items-center justify-center gap-3 rounded-md bg-white px-4 py-2'
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <h1 className='mxlg:flex hidden'>Palettes</h1>
        <span className='text-xs font-semibold tracking-wide text-black'>PAL</span>
      </button>

      {isOpen && (
        <div className='absolute bottom-16 right-0 z-[60] flex max-h-[320px] w-[320px] flex-col gap-2 overflow-hidden rounded-md border border-black bg-white p-3 text-black shadow-lg'>
          <div className='flex gap-2'>
            <input
              type='text'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Palette name'
              className='w-full border border-gray-300 px-2 py-1 text-sm outline-none'
            />
            <button
              type='button'
              className='border border-black px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50'
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              Save
            </button>
          </div>

          {error && <p className='text-xs text-red-600'>{error}</p>}

          <div className='flex-1 space-y-2 overflow-y-auto pr-1'>
            {palettes.map((palette) => (
              <div key={palette.id} className='border border-gray-300 p-2'>
                <div className='mb-2 flex items-center justify-between gap-2'>
                  <p className='truncate text-sm font-semibold'>{palette.name}</p>
                  <div className='flex gap-1'>
                    <button
                      type='button'
                      className='border border-black px-2 py-1 text-[11px]'
                      onClick={() => handleApply(palette)}
                    >
                      Apply
                    </button>
                    <button
                      type='button'
                      className='border border-red-600 px-2 py-1 text-[11px] text-red-600'
                      onClick={() => void handleDelete(palette.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className='grid grid-cols-5 gap-1'>
                  {[
                    palette.colors.textColor.color,
                    palette.colors.backgroundColor.color,
                    palette.colors.primaryColor.color,
                    palette.colors.secondaryColor.color,
                    palette.colors.accentColor.color,
                  ].map((colorValue, index) => (
                    <span
                      key={`${palette.id}-${index}`}
                      className='h-4 w-full border border-gray-300'
                      style={{ backgroundColor: colorValue as string }}
                    />
                  ))}
                </div>
              </div>
            ))}
            {!loading && palettes.length === 0 && (
              <p className='text-xs text-gray-500'>No saved palettes yet.</p>
            )}
            {loading && <p className='text-xs text-gray-500'>Loading…</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaletteManager;
