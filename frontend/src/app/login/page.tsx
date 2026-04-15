'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';
import { type AuthSession, writeAuthSession } from '@/lib/auth';
import { toApiUrl } from '@/lib/api';

export default function LoginPage() {
  const colors = useAppSelector((state) => state.global.colors);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(toApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to login');
      }
      const payload = (await response.json()) as AuthSession;
      writeAuthSession(payload);
      router.push('/chat');
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch auth service');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RealtimePageFrame>
      <section
        className='mx-auto my-auto w-full max-w-md border p-6'
        style={{
          borderColor: `${colors.secondaryColor.color}66`,
          backgroundColor: `${colors.secondaryColor.color}1A`,
        }}
      >
        <h1 className='text-3xl font-semibold'>Login</h1>
        <p className='mt-2 text-sm opacity-80'>Welcome back to SimpleScholar.</p>
        <form className='mt-6 space-y-4' onSubmit={handleLogin}>
          <label className='block text-sm'>
            Email
            <input
              className='mt-1 w-full border bg-transparent px-3 py-2 outline-none'
              style={{ borderColor: `${colors.secondaryColor.color}80` }}
              type='email'
              placeholder='you@company.com'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className='block text-sm'>
            Password
            <input
              className='mt-1 w-full border bg-transparent px-3 py-2 outline-none'
              style={{ borderColor: `${colors.secondaryColor.color}80` }}
              type='password'
              placeholder='••••••••'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className='text-sm text-red-500'>{error}</p>}
          <button
            type='submit'
            disabled={isLoading}
            className='w-full border px-4 py-2 font-medium disabled:opacity-60'
            style={{
              backgroundColor: colors.primaryColor.color as string,
              color: colors.backgroundColor.color as string,
              borderColor: colors.primaryColor.color as string,
            }}
          >
            {isLoading ? 'Logging in…' : 'Login'}
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
