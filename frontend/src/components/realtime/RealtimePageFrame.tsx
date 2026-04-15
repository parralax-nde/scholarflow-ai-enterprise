'use client';

import Link from 'next/link';
import React from 'react';

import ToolBar from '@/components/ToolBar/ToolBar';
import useOnLoad from '@/hooks/useOnload';

type RealtimePageFrameProps = {
  children: React.ReactNode;
};

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/login', label: 'Login' },
  { href: '/signup', label: 'Sign Up' },
  { href: '/privacy-policy', label: 'Privacy' },
];

export default function RealtimePageFrame({ children }: RealtimePageFrameProps) {
  const { colors, handleCloseColorPickers } = useOnLoad();

  return (
    <main
      className='relative min-h-screen overflow-hidden px-4 py-8'
      style={{
        backgroundColor: colors.backgroundColor.color as string,
        color: colors.textColor.color as string,
      }}
      onClick={handleCloseColorPickers}
    >
      <div className='absolute left-0 top-0 z-40'>
        <ToolBar />
      </div>

      <div className='mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col'>
        <header className='mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-4' style={{ borderColor: `${colors.secondaryColor.color}55` }}>
          <Link href='/' className='text-2xl font-semibold'>
            ScholarFlow AI
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
          </nav>
        </header>

        {children}
      </div>
    </main>
  );
}
