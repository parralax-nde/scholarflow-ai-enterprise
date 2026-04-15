export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || '/api'
).replace(/\/$/, '');

export const toApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
