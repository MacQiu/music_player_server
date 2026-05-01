import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBaseUrl, saveServerUrl, ping } from '../api/client';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  useEffect(() => {
    setUrl(getBaseUrl());
  }, []);

  const handleSave = async () => {
    await saveServerUrl(url.trim());
    Alert.alert('Saved', 'Server URL updated. Restart the app for changes to take full effect.');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const oldUrl = getBaseUrl();
    await saveServerUrl(url.trim());
    try {
      await ping();
      setTestResult(true);
    } catch {
      setTestResult(false);
      await saveServerUrl(oldUrl);
    }
    setTesting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.100:5000"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={testing}>
            <Ionicons name="wifi" size={16} color={Colors.text} />
            <Text style={styles.testBtnText}>{testing ? 'Testing...' : 'Test Connection'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        {testResult === true && (
          <View style={styles.resultRow}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.resultOk}>Connection successful</Text>
          </View>
        )}
        {testResult === false && (
          <View style={styles.resultRow}>
            <Ionicons name="close-circle" size={20} color={Colors.danger} />
            <Text style={styles.resultErr}>Connection failed</Text>
          </View>
        )}
      </View>
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
  label: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.surface2, borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.round, color: Colors.text, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, fontSize: FontSize.md,
  },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.round, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  testBtnText: { color: Colors.text, fontSize: FontSize.md },
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.round,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  saveBtnText: { color: '#000', fontSize: FontSize.md, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  resultOk: { color: Colors.success, fontSize: FontSize.md },
  resultErr: { color: Colors.danger, fontSize: FontSize.md },
});
