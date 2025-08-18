import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { deleteImage, getImage, getNote, getOrCreateNote, saveNote, uploadImageFromUrl, type Note } from '@/lib/secretnotes';

export default function IndexScreen() {
  const [phrase, setPhrase] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState<{ key: string | null }>({ key: null });
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');

  const valid = useMemo(() => phrase.length >= 3, [phrase]);

  const withLoad = useCallback(async <T,>(key: string, fn: () => Promise<T>) => {
    try {
      setLoading({ key });
      return await fn();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setLoading({ key: null });
    }
  }, []);

  const onLoad = () => withLoad('load', async () => {
    if (!valid) return Alert.alert('Invalid', 'Passphrase must be at least 3 characters.');
    const n = await getOrCreateNote(phrase);
    setNote(n);
    setMessage(n.message ?? '');
    setImageDataUrl(null);
  });


  const onGetImage = () => withLoad('getImage', async () => {
    if (!valid) return Alert.alert('Invalid', 'Passphrase must be at least 3 characters.');
    const res = await getImage(phrase);
    setImageDataUrl(res.dataUrl);
  });

  const onUploadImage = () => withLoad('uploadImage', async () => {
    if (!valid) return Alert.alert('Invalid', 'Passphrase must be at least 3 characters.');
    if (!imageUrlInput) return Alert.alert('Missing', 'Enter a direct image URL to upload.');
    const info = await uploadImageFromUrl(phrase, imageUrlInput);
    Alert.alert('Uploaded', `${info.fileName} (${info.contentType})`);
    setImageDataUrl(null);
    // Ideally refresh note hasImage flag by reloading
    const n = await getNote(phrase);
    setNote(n);
  });

  const onDeleteImage = () => withLoad('deleteImage', async () => {
    if (!valid) return Alert.alert('Invalid', 'Passphrase must be at least 3 characters.');
    await deleteImage(phrase);
    setImageDataUrl(null);
    const n = await getNote(phrase);
    setNote(n);
  });

  // Debounced autosave when message changes
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!note) return;
    if (!valid) return;
    if (message === note.message) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(() => {
      withLoad('autosave', async () => {
        const updated = await saveNote(phrase, message);
        setNote(updated);
      });
    }, 2000);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [message, note, valid]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Secure Notes</Text>

      <Text style={styles.label}>Passphrase (3+ chars)</Text>
      <TextInput
        value={phrase}
        onChangeText={setPhrase}
        placeholder="Enter passphrase"
        placeholderTextColor="#999"
        style={[styles.input, !valid && phrase.length > 0 ? styles.inputError : null]}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.row}>
        <View style={styles.button}><Button title="Load Note" onPress={onLoad} /></View>
      </View>

      {loading.key && (
        <View style={styles.loading}><ActivityIndicator /></View>
      )}

      {note && (
        <View>
          <View style={styles.card}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Type your secret message"
              placeholderTextColor="#999"
              style={[styles.input, styles.textarea]}
              multiline
            />
            <View style={styles.saveStatus}>
              {loading.key === 'autosave' && <ActivityIndicator size="small" style={{ marginRight: 6 }} />}
              <Text style={styles.helper}>
                {loading.key === 'autosave' ? 'Saving...' : 'Changes are saved automatically.'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.label}>Image</Text>
          {imageDataUrl ? (
            <Image source={{ uri: imageDataUrl }} style={styles.image} contentFit="contain" />
          ) : note.hasImage ? (
            <Text style={styles.helper}>Note has an image. Tap "Get Image" to fetch.</Text>
          ) : (
            <Text style={styles.helper}>No image uploaded yet.</Text>
          )}
          <View style={styles.row}>
            <View style={styles.button}><Button title="Get Image" onPress={onGetImage} /></View>
            <View style={styles.button}><Button title="Delete Image" color="#c00" onPress={onDeleteImage} /></View>
          </View>

          <TextInput
            value={imageUrlInput}
            onChangeText={setImageUrlInput}
            placeholder="Direct image URL to upload"
            placeholderTextColor="#999"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <View style={styles.button}><Button title="Upload From URL" onPress={onUploadImage} /></View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '500', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: 'white',
  },
  inputError: { borderColor: '#c00' },
  textarea: { height: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: { flex: 1 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8, padding: 12, backgroundColor: '#fafafa' },
  divider: { height: 1, backgroundColor: '#e5e5e5', marginVertical: 12 },
  helper: { color: '#666', fontSize: 12 },
  image: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#eee' },
  loading: { marginTop: 8 },
  saveStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4 }
});
