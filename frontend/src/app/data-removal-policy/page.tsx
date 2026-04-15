'use client';

import React from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function DataRemovalPolicyPage() {
  const colors = useAppSelector((state) => state.global.colors);

  return (
    <RealtimePageFrame>
      <section className='mx-auto my-auto w-full max-w-3xl border p-6' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}1A` }}>
        <h1 className='text-3xl font-semibold'>Data Removal Policy</h1>
        <p className='mt-4 text-sm opacity-90'>You can request deletion of account profile data and workspace content at any time.</p>
        <p className='mt-3 text-sm opacity-90'>Submit removal requests through support@simplescholar.ai and include your organization ID, email, and requested scope.</p>
        <p className='mt-3 text-sm opacity-90'>Verified requests are processed with confirmation and operational logs retained only for security and compliance.</p>
      </section>
    </RealtimePageFrame>
  );
}
