'use client';

import Link from 'next/link';
import React from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

export default function LoginPage() {
  const colors = useAppSelector((state) => state.global.colors);

  return (
    <RealtimePageFrame>
      <section className='mx-auto my-auto w-full max-w-md border p-6' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}1A` }}>
        <h1 className='text-3xl font-semibold'>Login</h1>
        <p className='mt-2 text-sm opacity-80'>Welcome back to ScholarFlow AI.</p>
        <form className='mt-6 space-y-4'>
          <label className='block text-sm'>
            Email
            <input className='mt-1 w-full border bg-transparent px-3 py-2 outline-none' style={{ borderColor: `${colors.secondaryColor.color}80` }} type='email' placeholder='you@company.com' />
          </label>
          <label className='block text-sm'>
            Password
            <input className='mt-1 w-full border bg-transparent px-3 py-2 outline-none' style={{ borderColor: `${colors.secondaryColor.color}80` }} type='password' placeholder='••••••••' />
          </label>
          <button type='button' className='w-full border px-4 py-2 font-medium' style={{ backgroundColor: colors.primaryColor.color as string, color: colors.backgroundColor.color as string, borderColor: colors.primaryColor.color as string }}>
            Login
          </button>
        </form>
        <div className='mt-4 flex items-center justify-between text-sm'>
          <Link href='/forgot-password' className='hover:underline'>
            Forgot password?
          </Link>
          <Link href='/signup' className='hover:underline'>
            Create account
          </Link>
        </div>
      </section>
    </RealtimePageFrame>
  );
}
