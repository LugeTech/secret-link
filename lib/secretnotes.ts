import { endpoints } from '@/constants/api';

export type Note = {
  id: string;
  message: string;
  hasImage: boolean;
  created: string;
  updated: string;
};

export type ApiError = { error: string };

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as ApiError;
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function health(): Promise<{ message: string; version: string }>
{
  const res = await fetch(endpoints.health());
  return handleJson(res);
}

export async function getNote(phrase: string): Promise<Note> {
  const res = await fetch(endpoints.note(phrase));
  return handleJson<Note>(res);
}

export async function updateNote(phrase: string, message: string): Promise<Note> {
  const res = await fetch(endpoints.note(phrase), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handleJson<Note>(res);
}

export async function deleteImage(phrase: string): Promise<{ message: string }>{
  const res = await fetch(endpoints.noteImage(phrase), { method: 'DELETE' });
  return handleJson(res);
}

export async function getImage(phrase: string): Promise<{ dataUrl: string; contentType: string }>{
  const res = await fetch(endpoints.noteImage(phrase));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buf = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  return { dataUrl: `data:${contentType};base64,${base64}`, contentType };
}

export async function uploadImageFromUrl(phrase: string, imageUrl: string): Promise<{ id: string; fileName: string; contentType: string; created: string }>{
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
  const contentType = imgRes.headers.get('content-type') || 'application/octet-stream';
  const blob = await imgRes.blob();
  const nameGuess = imageUrl.split('?')[0].split('#')[0].split('/').pop() || 'image';

  const form = new FormData();
  form.append('image', blob as any, nameGuess);

  const res = await fetch(endpoints.noteImage(phrase), { method: 'POST', body: form });
  return handleJson(res);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  // btoa is available in RN via global atob/btoa polyfill in Hermes/JSI env
  return btoa(binary);
}
