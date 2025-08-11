// Simple API configuration
export const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const endpoints = {
  health: () => `${BASE_URL}/api/secretnotes/`,
  note: (phrase: string) => `${BASE_URL}/api/secretnotes/notes/${encodeURIComponent(phrase)}`,
  noteImage: (phrase: string) => `${BASE_URL}/api/secretnotes/notes/${encodeURIComponent(phrase)}/image`,
};
