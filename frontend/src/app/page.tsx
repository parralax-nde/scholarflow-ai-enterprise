'use client';

import Link from 'next/link';
import React from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function HomePage() {
  const colors = useAppSelector((state) => state.global.colors);

  const cards = [
    {
      title: 'Realtime Brand System',
      text: 'Control typography contrast, UI accents, and dark mode behavior live with shared color primitives.',
    },
    {
      title: 'Enterprise-Ready Auth',
      text: 'Login, sign up, and password recovery interfaces aligned with a modern security-first product experience.',
    },
    {
      title: 'Streaming AI Workspace',
      text: 'Chat with token-level realtime generation and integrated context-aware backend orchestration.',
    },
  ];

  return (
    <RealtimePageFrame>
      <section className='grid min-h-[calc(100vh-12rem)] grid-rows-[1fr_auto] gap-8'>
        <div className='grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]'>
          <div className='space-y-6'>
            <p
              className='inline-block border px-3 py-1 text-xs uppercase tracking-[0.2em]'
              style={{ borderColor: `${colors.accentColor.color}80`, color: colors.accentColor.color as string }}
            >
              Modern Research Copilot
            </p>
            <h1 className='text-4xl font-semibold leading-tight md:text-6xl'>
              One-screen enterprise landing powered by realtime color utilities.
            </h1>
            <p className='max-w-2xl text-base opacity-90 md:text-lg'>
              ScholarFlow AI combines policy transparency, secure authentication, and token-level streaming chat in one cohesive product experience.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Link
                href='/chat'
                className='border px-5 py-2.5 font-medium transition-opacity hover:opacity-85'
                style={{ backgroundColor: colors.primaryColor.color as string, color: colors.backgroundColor.color as string, borderColor: colors.primaryColor.color as string }}
              >
                Open Chat UI
              </Link>
              <Link href='/signup' className='border px-5 py-2.5 font-medium' style={{ borderColor: `${colors.secondaryColor.color}90` }}>
                Create Account
              </Link>
            </div>
          </div>

          <div className='grid gap-3'>
            {cards.map((card) => (
              <article
                key={card.title}
                className='border p-5'
                style={{ backgroundColor: `${colors.secondaryColor.color}1A`, borderColor: `${colors.secondaryColor.color}66` }}
              >
                <h2 className='mb-2 text-xl font-semibold'>{card.title}</h2>
                <p className='text-sm opacity-90'>{card.text}</p>
              </article>
            ))}
          </div>
        </div>

        <footer className='flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm' style={{ borderColor: `${colors.secondaryColor.color}55` }}>
          <p className='opacity-80'>© {new Date().getFullYear()} ScholarFlow AI Enterprise</p>
          <div className='flex flex-wrap gap-4'>
            <Link href='/privacy-policy' className='underline-offset-4 hover:underline'>
              Privacy Policy
            </Link>
            <Link href='/terms-of-use' className='underline-offset-4 hover:underline'>
              Terms of Use
            </Link>
            <Link href='/data-removal-policy' className='underline-offset-4 hover:underline'>
              Data Removal Policy
            </Link>
          </div>
        </footer>
      </section>
    </RealtimePageFrame>
  );
}
