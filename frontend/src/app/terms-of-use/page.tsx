'use client';

import React from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function TermsOfUsePage() {
  const colors = useAppSelector((state) => state.global.colors);

  return (
    <RealtimePageFrame>
      <section className='mx-auto my-auto w-full max-w-3xl border p-6' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}1A` }}>
        <h1 className='text-3xl font-semibold'>Terms of Use</h1>
        <p className='mt-4 text-sm opacity-90'>Use ScholarFlow AI responsibly and in compliance with applicable law, academic integrity guidelines, and your organization policy.</p>
        <p className='mt-3 text-sm opacity-90'>You are responsible for validating generated outputs before publication, submission, or operational use.</p>
        <p className='mt-3 text-sm opacity-90'>Abusive, unlawful, or unauthorized usage may result in account suspension or access revocation.</p>
      </section>
    </RealtimePageFrame>
  );
}
