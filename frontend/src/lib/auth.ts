export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'free' | 'enterprise' | string;
  };
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

const AUTH_STORAGE_KEY = 'simplescholar_auth';

export const readAuthSession = (): AuthSession | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

export const writeAuthSession = (session: AuthSession) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearAuthSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};
