import React, { useState, useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { getBaseUrl } from '../api/client';
import { getLocalCoverUri, getLocalImageUri, downloadImageByKey } from '../utils/songStorage';
import { useData } from '../contexts/DataContext';
import { Colors, Radius } from '../constants/theme';

interface Props {
  coverUrl?: string | null;
  songId?: string;
  cacheKey?: string;
  size?: number;
  round?: boolean;
  placeholder?: string;
  imgVersion?: number;
}

export default function CoverImage({ coverUrl, songId, cacheKey, size = 48, round = false, placeholder = '\u266A', imgVersion }: Props) {
  const base = getBaseUrl();
  const { online } = useData();
  const borderRadius = round ? size / 2 : Radius.sm;
  const serverUri = coverUrl ? `${base}${coverUrl}${imgVersion ? `?v=${imgVersion}` : ''}` : null;
  const fullServerUrl = coverUrl ? `${base}${coverUrl}` : null;

  const [uri, setUri] = useState<string | null>(online ? serverUri : null);
  const [failedServer, setFailedServer] = useState(false);
  const mountId = useRef(0);
  const localRef = useRef<string | null>(null);

  useEffect(() => {
    const id = ++mountId.current;
    setFailedServer(false);
    localRef.current = null;

    if (!online) {
      // Offline: go straight to local cache, skip server entirely
      if (songId) {
        getLocalCoverUri(songId).then((local) => {
          if (id === mountId.current) setUri(local);
        });
      } else if (cacheKey) {
        getLocalImageUri(cacheKey).then((local) => {
          if (id === mountId.current) setUri(local);
        });
      } else {
        setUri(null);
      }
      return;
    }

    // Online: try server first
    if (serverUri) {
      setUri(serverUri);
    } else if (songId) {
      getLocalCoverUri(songId).then((local) => {
        if (id === mountId.current) setUri(local);
      });
    } else if (cacheKey) {
      getLocalImageUri(cacheKey).then((local) => {
        if (id === mountId.current) setUri(local);
      });
    } else {
      setUri(null);
    }

    // Pre-resolve local fallback for fast error recovery
    if (serverUri) {
      if (songId) {
        getLocalCoverUri(songId).then((local) => {
          if (id === mountId.current && local) localRef.current = local;
        });
      } else if (cacheKey) {
        getLocalImageUri(cacheKey).then((local) => {
          if (id === mountId.current && local) localRef.current = local;
        });
      }
    }
  }, [serverUri, songId, cacheKey, online]);

  const handleLoad = () => {
    if (online && cacheKey && fullServerUrl && !failedServer) {
      getLocalImageUri(cacheKey).then((local) => {
        if (!local) downloadImageByKey(cacheKey, fullServerUrl).catch(() => {});
      });
    }
  };

  const handleError = () => {
    if (failedServer) return;
    setFailedServer(true);

    if (localRef.current) {
      setUri(localRef.current);
      return;
    }

    if (songId) {
      getLocalCoverUri(songId).then((local) => {
        if (local) setUri(local);
        else setUri(null);
      });
    } else if (cacheKey) {
      getLocalImageUri(cacheKey).then((local) => {
        if (local) setUri(local);
        else setUri(null);
      });
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius }]} onError={handleError} onLoad={handleLoad} />
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
