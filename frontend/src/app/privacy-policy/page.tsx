'use client';

import React from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function PrivacyPolicyPage() {
  const colors = useAppSelector((state) => state.global.colors);

  return (
    <RealtimePageFrame>
      <section className='mx-auto my-auto w-full max-w-3xl border p-6' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}1A` }}>
        <h1 className='text-3xl font-semibold'>Privacy Policy</h1>
        <p className='mt-4 text-sm opacity-90'>We collect account details, usage analytics, and conversation metadata to deliver and improve ScholarFlow AI services.</p>
        <p className='mt-3 text-sm opacity-90'>We process data under strict access controls, role-based permissions, and auditable operational workflows.</p>
        <p className='mt-3 text-sm opacity-90'>For privacy requests, contact privacy@scholarflow.ai from your registered account email.</p>
      </section>
    </RealtimePageFrame>
  );
}
