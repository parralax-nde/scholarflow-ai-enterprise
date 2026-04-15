'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import { clearAuthSession, readAuthSession } from '@/lib/auth';
import useOnLoad from '@/hooks/useOnload';

import ToolBar from '@/components/ToolBar/ToolBar';

type RealtimePageFrameProps = {
  children: React.ReactNode;
};

const navLinks = [
  { href: '/chat', label: 'Workspace' },
  { href: '/', label: 'Features' },
  { href: '/privacy-policy', label: 'Privacy' },
];
const ADMIN_EMAIL = 'admin@gmail.com';

const pageTitleByPath: Record<string, string> = {
  '/': 'SimpleScholar — AI Research Copilot',
  '/chat': 'Workspace | SimpleScholar',
  '/login': 'Login | SimpleScholar',
  '/signup': 'Create account | SimpleScholar',
  '/forgot-password': 'Recover account | SimpleScholar',
  '/privacy-policy': 'Privacy Policy | SimpleScholar',
  '/terms-of-use': 'Terms of Use | SimpleScholar',
  '/data-removal-policy': 'Data Removal Policy | SimpleScholar',
};

export default function RealtimePageFrame({ children }: RealtimePageFrameProps) {
  const { colors, handleCloseColorPickers } = useOnLoad();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const session = readAuthSession();
    setIsAuthenticated(Boolean(session?.access_token));
    setIsAdmin((session?.user?.email || '').toLowerCase() === ADMIN_EMAIL);
  }, [pathname]);

  useEffect(() => {
    const title = pageTitleByPath[pathname] || 'SimpleScholar';
    document.title = title;
  }, [pathname]);

  const authAction = useMemo(() => {
    if (isAuthenticated) {
      return (
        <button
          type='button'
          className='border px-3 py-1.5 text-sm transition-opacity hover:opacity-80'
          style={{ borderColor: `${colors.secondaryColor.color}80` }}
          onClick={() => {
            clearAuthSession();
            setIsAuthenticated(false);
            setIsAdmin(false);
          }}
        >
          Log out
        </button>
      );
    }

    return (
      <Link
        href='/login'
        className='border px-3 py-1.5 text-sm transition-opacity hover:opacity-80'
        style={{ borderColor: `${colors.secondaryColor.color}80` }}
      >
        Login
      </Link>
    );
  }, [colors.secondaryColor.color, isAuthenticated]);

  return (
    <main
      className='relative min-h-screen overflow-hidden px-4 py-8'
      style={{
        backgroundColor: colors.backgroundColor.color as string,
        color: colors.textColor.color as string,
      }}
      onClick={handleCloseColorPickers}
    >
      {isAdmin && (
        <div className='absolute left-0 top-0 z-40'>
          <ToolBar />
        </div>
      )}

      <div className='mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1700px] flex-col'>
        <header
          className='mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-4'
          style={{ borderColor: `${colors.secondaryColor.color}55` }}
        >
          <Link href='/' className='text-2xl font-semibold'>
            SimpleScholar
          </Link>
          <nav className='flex flex-wrap items-center gap-2'>
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className='border px-3 py-1.5 text-sm transition-opacity hover:opacity-80'
                style={{ borderColor: `${colors.secondaryColor.color}80` }}
              >
                {item.label}
              </Link>
            ))}
            {authAction}
          </nav>
        </header>

        {children}
      </div>
    </main>
  );
}
