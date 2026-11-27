import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadSong } from '../api/client';
import { useData } from '../contexts/DataContext';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

export default function UploadScreen() {
  const router = useRouter();
  const { refreshSongs, bumpImgVersion } = useData();
  const [audioFile, setAudioFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/wav', 'audio/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAudioFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'audio/mpeg' });
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setCoverUri(asset.uri);
    setCoverName(asset.fileName || 'cover.jpg');
  };

  const handleSubmit = async () => {
    if (!audioFile) {
      setStatus({ ok: false, msg: 'Select an audio file first' });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, msg: 'Uploading...' });
    try {
      const data = await uploadSong(
        audioFile.uri, audioFile.name, audioFile.mimeType,
        { title, artist, album },
        coverUri || undefined,
        coverName || undefined,
      );
      setStatus({ ok: true, msg: `Uploaded "${data.title}"` });
      setAudioFile(null);
      setCoverUri(null);
      setCoverName(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      refreshSongs();
      bumpImgVersion();
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Upload Song</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <TouchableOpacity style={styles.coverPicker} onPress={pickCover}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImg} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image" size={32} color={Colors.textMuted} />
                <Text style={styles.coverLabel}>Cover</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.fields}>
            <TouchableOpacity style={styles.fileBtn} onPress={pickAudio}>
              <Ionicons name="document" size={16} color={Colors.text} />
              <Text style={styles.fileBtnText} numberOfLines={1}>
                {audioFile ? audioFile.name : 'Select audio file...'}
              </Text>
            </TouchableOpacity>
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor={Colors.textMuted}
              value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Artist" placeholderTextColor={Colors.textMuted}
              value={artist} onChangeText={setArtist} />
            <TextInput style={styles.input} placeholder="Album" placeholderTextColor={Colors.textMuted}
              value={album} onChangeText={setAlbum} />
          </View>
        </View>

        <TouchableOpacity style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={handleSubmit} disabled={uploading}>
          <Text style={styles.uploadBtnText}>{uploading ? 'Uploading...' : 'Upload'}</Text>
        </TouchableOpacity>

        {status && (
          <Text style={[styles.statusMsg, status.ok ? styles.statusOk : styles.statusErr]}>
            {status.msg}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  content: { padding: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.lg },
  coverPicker: {
    width: 120, height: 120, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: { alignItems: 'center', gap: Spacing.xs },
  coverLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  fields: { flex: 1, gap: Spacing.sm },
  fileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  fileBtnText: { color: Colors.text, fontSize: FontSize.sm, flex: 1 },
  input: {
    backgroundColor: Colors.surface2, borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.sm, color: Colors.text, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, fontSize: FontSize.md,
  },
  uploadBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.round,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xl,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: '#000', fontSize: FontSize.lg, fontWeight: '700' },
  statusMsg: { fontSize: FontSize.sm, marginTop: Spacing.md, textAlign: 'center' },
  statusOk: { color: Colors.success },
  statusErr: { color: Colors.danger },
});
