'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';
import { type AuthSession, writeAuthSession } from '@/lib/auth';
import { toApiUrl } from '@/lib/api';

export default function SignupPage() {
  const colors = useAppSelector((state) => state.global.colors);
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(toApiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          tier: 'free',
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to create account');
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
        <h1 className='text-3xl font-semibold'>Create account</h1>
        <p className='mt-2 text-sm opacity-80'>Start with 100 pages free on SimpleScholar.</p>
        <form className='mt-6 space-y-4' onSubmit={handleSignup}>
          <label className='block text-sm'>
            Full name
            <input
              className='mt-1 w-full border bg-transparent px-3 py-2 outline-none'
              style={{ borderColor: `${colors.secondaryColor.color}80` }}
              type='text'
              placeholder='Jane Doe'
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
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
              minLength={8}
              placeholder='At least 8 characters'
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
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className='mt-4 text-sm'>
          Already have an account?{' '}
          <Link href='/login' className='hover:underline'>
            Login
          </Link>
        </p>
      </section>
    </RealtimePageFrame>
  );
}
