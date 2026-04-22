import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-chart-kit';
import { useData } from '../../contexts/DataContext';
import { getWrappedAnalytics } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

const screenWidth = Dimensions.get('window').width - 48;

const chartConfig = {
  backgroundColor: Colors.surface2,
  backgroundGradientFrom: Colors.surface2,
  backgroundGradientTo: Colors.surface2,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
  labelColor: () => Colors.textMuted,
  barPercentage: 0.6,
  propsForLabels: { fontSize: 9 },
};

const greenChartConfig = { ...chartConfig, color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})` };
const orangeChartConfig = { ...chartConfig, color: (opacity = 1) => `rgba(255, 85, 0, ${opacity})` };

function fmtTime(secs: number) {
  if (!secs) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { analytics, analyticsLoading } = useData();
  const currentYear = new Date().getFullYear();
  const [wrappedYear, setWrappedYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState<any>(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  useEffect(() => {
    setWrappedLoading(true);
    getWrappedAnalytics(wrappedYear)
      .then(data => setWrapped(data))
      .catch(() => setWrapped(null))
      .finally(() => setWrappedLoading(false));
  }, [wrappedYear]);

  if (analyticsLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.page}><Text style={styles.muted}>Loading analytics...</Text></View>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.page}><Text style={styles.muted}>No analytics data</Text></View>
      </SafeAreaView>
    );
  }

  const songChartData = (analytics.top_songs || []).slice(0, 5);
  const artistChartData = (analytics.top_artists || []).slice(0, 5);

  const songLabels = songChartData.map((s: any) => s.title.length > 10 ? s.title.slice(0, 10) + '\u2026' : s.title);
  const songValues = songChartData.map((s: any) => s.play_count);
  const artistLabels = artistChartData.map((a: any) => a.artist.length > 10 ? a.artist.slice(0, 10) + '\u2026' : a.artist);
  const artistValues = artistChartData.map((a: any) => Math.round((a.total_time || 0) / 60));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <Text style={styles.heading}>Analytics</Text>

        <View style={styles.statsRow}>
          <StatCard value={analytics.total_plays} label="Total Plays" />
          <StatCard value={fmtTime(analytics.total_listening_time)} label="Listening Time" />
        </View>

        <Text style={styles.sectionTitle}>Top Songs</Text>
        {songChartData.length === 0 ? <Text style={styles.muted}>No plays yet</Text> : (
          <View style={styles.chartBox}>
            <BarChart
              data={{ labels: songLabels, datasets: [{ data: songValues }] }}
              width={screenWidth}
              height={180}
              chartConfig={chartConfig}
              fromZero
              showValuesOnTopOfBars
              yAxisLabel=""
              yAxisSuffix=""
              style={styles.chart}
            />
          </View>
        )}

        <Text style={styles.sectionTitle}>Top Artists (min)</Text>
        {artistChartData.length === 0 ? <Text style={styles.muted}>No artist data</Text> : (
          <View style={styles.chartBox}>
            <BarChart
              data={{ labels: artistLabels, datasets: [{ data: artistValues.length > 0 ? artistValues : [0] }] }}
              width={screenWidth}
              height={180}
              chartConfig={greenChartConfig}
              fromZero
              showValuesOnTopOfBars
              yAxisLabel=""
              yAxisSuffix=""
              style={styles.chart}
            />
          </View>
        )}

        <View style={styles.wrappedHeader}>
          <Text style={styles.sectionTitle}>Yearly Stats {wrappedYear}</Text>
          <View style={styles.yearPicker}>
            {years.map(y => (
              <TouchableOpacity key={y}
                style={[styles.yearBtn, wrappedYear === y && styles.yearBtnActive]}
                onPress={() => setWrappedYear(y)}>
                <Text style={[styles.yearBtnText, wrappedYear === y && styles.yearBtnTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {wrappedLoading ? <Text style={styles.muted}>Loading...</Text> : wrapped ? (
          <>
            <View style={styles.statsRow}>
              <StatCard value={wrapped.total_plays} label="Plays" />
              <StatCard value={fmtTime(wrapped.total_listening_time)} label="Time" />
            </View>
            {(wrapped.top_songs || []).length > 0 && (
              <View style={styles.chartBox}>
                <BarChart
                  data={{
                    labels: (wrapped.top_songs || []).slice(0, 5).map((s: any) =>
                      s.title.length > 8 ? s.title.slice(0, 8) + '\u2026' : s.title),
                    datasets: [{ data: (wrapped.top_songs || []).slice(0, 5).map((s: any) => s.play_count) }],
                  }}
                  width={screenWidth}
                  height={150}
                  chartConfig={orangeChartConfig}
                  fromZero
                  showValuesOnTopOfBars
                  yAxisLabel=""
                  yAxisSuffix=""
                  style={styles.chart}
                />
              </View>
            )}
          </>
        ) : <Text style={styles.muted}>No data for {wrappedYear}</Text>}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  page: { flex: 1 },
  pageContent: { padding: Spacing.lg },
  heading: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textMuted, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  statCard: {
    flex: 1, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.accent },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  chartBox: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.sm, overflow: 'hidden',
  },
  chart: { borderRadius: Radius.md },
  wrappedHeader: { marginTop: Spacing.lg },
  yearPicker: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', marginBottom: Spacing.md },
  yearBtn: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  yearBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  yearBtnText: { color: Colors.textMuted, fontSize: FontSize.xs },
  yearBtnTextActive: { color: Colors.white },
});
