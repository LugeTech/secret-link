import { endpoints } from '@/constants/api';

function normalizePhrase(p: string): string {
  return (p ?? '').trim();
}

export type Note = {
  id: string;
  message: string;
  hasImage: boolean;
  created: string;
  updated: string;
};

export type ApiError = { error?: string; message?: string };

// Use a non-empty default to avoid backend GET 500 when content is empty
const DEFAULT_INIT_MESSAGE = 'Welcome to your new secure note!';

async function handleJson<T>(res: Response): Promise<T> {
  // Read text once, then parse if present
  let text = '';
  try {
    text = await res.text();
  } catch {}

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    if (text) {
      try {
        const data = JSON.parse(text) as ApiError | any;
        if (data?.error) msg = `${res.status} ${res.statusText}: ${data.error}`;
        else if (data?.message) msg = `${res.status} ${res.statusText}: ${data.message}`;
      } catch {
        // Non-JSON error body; include snippet for context
        msg = `${msg} - ${text.substring(0, 200)}`;
      }
    }
    throw new Error(msg);
  }

  if (!text) {
    // Successful response with no body (e.g., 204 or some POSTs)
    return {} as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Non-JSON but successful; return empty object to avoid breaking flow
    return {} as unknown as T;
  }
}

export async function getNote(phrase: string): Promise<Note> {
  const key = normalizePhrase(phrase);
  const url = endpoints.note(key);
  
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await handleJson<Note>(res);
    return data;
  } catch (error) {
    console.warn('[API] getNote() error (will be handled by caller if expected):', error);
    throw error;
  }
}

// Fetch the note, and if it doesn't exist, create it and return the created note.
// We treat a 404 or "not found" error message as the signal to create.
export async function getOrCreateNote(phrase: string): Promise<Note> {
  const key = normalizePhrase(phrase);
  try {
    const existing = await getNote(key);
    return existing;
  } catch (e: any) {
    console.warn('[API] getOrCreateNote() fetch failed (likely missing note):', e?.message ?? String(e));
    // Attempt to initialize the note on any fetch failure.
    // Prefer PUT upsert (recommended by backend), fallback to POST.
    let createdOrUpdated: Note | null = null;
    try {
      createdOrUpdated = await saveNote(key, DEFAULT_INIT_MESSAGE);
    } catch (patchErr: any) {
      console.warn('[API] getOrCreateNote() PATCH upsert failed, trying POST create...', patchErr?.message ?? String(patchErr));
      try {
        createdOrUpdated = await createNote(key, DEFAULT_INIT_MESSAGE);
      } catch (postErr: any) {
        console.error('[API] getOrCreateNote() POST create also failed:', postErr);
        throw postErr || patchErr || e; // bubble the most informative error
      }
    }
    // Use the successful write response as DB confirmation to avoid flaky GET for some phrases
    if (createdOrUpdated) return createdOrUpdated;
    // As a safety net (shouldn't happen), attempt a final GET
    return await getNote(key);
  }
}

// Create a new note; server expects POST for creation
export async function createNote(phrase: string, message: string): Promise<Note> {
  const key = normalizePhrase(phrase);
  console.log('[API] createNote() called with phrase length:', key.length);
  const url = endpoints.note(key);
  console.log('[API] createNote() URL:', url);
  console.log('[API] createNote() payload:', { message: message.length + ' characters' });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ message }),
    });
    console.log('[API] createNote() response status:', res.status);
    const data = await handleJson<Note>(res);
    console.log('[API] createNote() success:', { phraseLength: key.length, data });
    return data;
  } catch (error) {
    console.error('[API] createNote() error:', error);
    throw error;
  }
}

// Upsert: create or update note in a single call (preferred by backend guidance)
export async function saveNote(phrase: string, message: string): Promise<Note> {
  const key = normalizePhrase(phrase);
  const url = endpoints.note(key);

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await handleJson<Note>(res);
    return data;
  } catch (error) {
    console.error('[API] saveNote() error:', error);
    throw error;
  }
}

// Only use PATCH if you specifically need 404 behaviour for non-existent notes
export async function updateNote(phrase: string, message: string): Promise<Note> {
  const key = normalizePhrase(phrase);
  const url = endpoints.note(key);
  
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await handleJson<Note>(res);
    return data;
  } catch (error) {
    console.error('[API] updateNote() error:', error);
    throw error;
  }
}

export async function deleteImage(phrase: string): Promise<{ message: string }>{
  const key = normalizePhrase(phrase);
  const res = await fetch(endpoints.noteImage(key), { method: 'DELETE', headers: { 'Accept': 'application/json' } });
  const data = await handleJson<{ message: string }>(res);
  console.log('[API] deleteImage()', { phraseLength: key.length, data });
  return data;
}

export async function getImage(phrase: string): Promise<{ dataUrl: string; contentType: string }>{
  const key = normalizePhrase(phrase);
  const res = await fetch(endpoints.noteImage(key));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buf = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  console.log('[API] getImage()', { phraseLength: key.length, contentType, bytes: buf.byteLength, base64Length: base64.length });
  return { dataUrl: `data:${contentType};base64,${base64}`, contentType };
}

export async function uploadImageFromUrl(phrase: string, imageUrl: string): Promise<{ id: string; fileName: string; contentType: string; created: string }>{
  const key = normalizePhrase(phrase);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
  const contentType = imgRes.headers.get('content-type') || 'application/octet-stream';
  const blob = await imgRes.blob();
  const nameGuess = imageUrl.split('?')[0].split('#')[0].split('/').pop() || 'image';

  const form = new FormData();
  form.append('image', blob as any, nameGuess);

  const res = await fetch(endpoints.noteImage(key), { method: 'POST', headers: { 'Accept': 'application/json' }, body: form });
  const info = await handleJson<{ id: string; fileName: string; contentType: string; created: string }>(res);
  console.log('[API] uploadImageFromUrl()', { phraseLength: key.length, imageUrl, uploaded: info });
  return info;
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
