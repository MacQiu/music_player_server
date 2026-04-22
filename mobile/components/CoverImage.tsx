import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { getBaseUrl } from '../api/client';
import { Colors, Radius } from '../constants/theme';

interface Props {
  coverUrl?: string | null;
  size?: number;
  round?: boolean;
  placeholder?: string;
  imgVersion?: number;
}

export default function CoverImage({ coverUrl, size = 48, round = false, placeholder = '\u266A', imgVersion }: Props) {
  const base = getBaseUrl();
  const borderRadius = round ? size / 2 : Radius.sm;
  const uri = coverUrl ? `${base}${coverUrl}${imgVersion ? `?v=${imgVersion}` : ''}` : null;

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius }]} />
      ) : (
        <Text style={[styles.placeholder, { fontSize: size * 0.35 }]}>{placeholder}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    color: Colors.textMuted,
  },
});
