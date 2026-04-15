'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAppSelector } from 'store/store-hooks';

import { toApiUrl } from '@/lib/api';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function HomePage() {
  const colors = useAppSelector((state) => state.global.colors);
  const [pricing, setPricing] = useState({ free_pages: 100, price_per_page_usd: 0.1 });

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(toApiUrl('/billing/pricing'));
        if (!response.ok) return;
        const payload = (await response.json()) as {
          free_pages: number;
          price_per_page_usd: number;
        };
        setPricing(payload);
      } catch {
        // Keep static defaults if pricing endpoint is unavailable.
      }
    })();
  }, []);

  const cards = [
    {
      title: 'AI Research Assistant',
      text: 'Generate structured, source-aware drafts and iterate quickly with conversation memory.',
    },
    {
      title: 'Live DOCX Workspace',
      text: 'Turn chat output into DOCX artifacts and review rendered documents side-by-side.',
    },
    {
      title: 'Academic Quality Guardrails',
      text: 'Use built-in checks, plagiarism tools, and citation workflows for safer submissions.',
    },
  ];

  return (
    <RealtimePageFrame>
      <section className='grid min-h-[calc(100vh-12rem)] grid-rows-[1fr_auto] gap-8'>
        <div className='grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]'>
          <div className='space-y-6'>
            <p
              className='inline-block border px-3 py-1 text-xs uppercase tracking-[0.2em]'
              style={{
                borderColor: `${colors.accentColor.color}80`,
                color: colors.accentColor.color as string,
              }}
            >
              AI Writing Platform
            </p>
            <h1 className='text-4xl font-semibold leading-tight md:text-6xl'>
              Research, draft, and export better papers with SimpleScholar.
            </h1>
            <p className='max-w-2xl text-base opacity-90 md:text-lg'>
              SimpleScholar is built for students, researchers, and teams that need
              fast AI drafting plus document-ready outputs.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Link
                href='/chat'
                className='border px-5 py-2.5 font-medium transition-opacity hover:opacity-85'
                style={{
                  backgroundColor: colors.primaryColor.color as string,
                  color: colors.backgroundColor.color as string,
                  borderColor: colors.primaryColor.color as string,
                }}
              >
                Open Workspace
              </Link>
              <Link
                href='/signup'
                className='border px-5 py-2.5 font-medium'
                style={{ borderColor: `${colors.secondaryColor.color}90` }}
              >
                Create Account
              </Link>
            </div>
          </div>

          <div className='grid gap-3'>
            {cards.map((card) => (
              <article
                key={card.title}
                className='border p-5'
                style={{
                  backgroundColor: `${colors.secondaryColor.color}1A`,
                  borderColor: `${colors.secondaryColor.color}66`,
                }}
              >
                <h2 className='mb-2 text-xl font-semibold'>{card.title}</h2>
                <p className='text-sm opacity-90'>{card.text}</p>
              </article>
            ))}
            <article
              className='border p-5'
              style={{
                backgroundColor: `${colors.primaryColor.color}22`,
                borderColor: `${colors.primaryColor.color}66`,
              }}
            >
              <h2 className='mb-2 text-xl font-semibold'>Pricing</h2>
              <p className='text-sm opacity-90'>
                {pricing.free_pages} pages free. After that, usage is billed at $
                {pricing.price_per_page_usd.toFixed(2)} per page.
              </p>
            </article>
          </div>
        </div>

        <footer
          className='flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm'
          style={{ borderColor: `${colors.secondaryColor.color}55` }}
        >
          <p className='opacity-80'>© {new Date().getFullYear()} SimpleScholar</p>
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
