import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, LabelList, ResponsiveContainer, CartesianGrid } from 'recharts';
import ScrollPage from '../components/ScrollPage';
import { useData } from '../contexts/DataContext';
import { fmtListeningTime } from '../utils/format';
import { Colors } from '../constants/theme';

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Chart({ data, height, color }: { data: { label: string; value: number }[]; height: number; color: string }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="label" tick={{ fill: Colors.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fill: Colors.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={36}>
            <LabelList dataKey="value" position="top" fill={Colors.text} fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const truncate = (s: string, n: number) => (s && s.length > n ? s.slice(0, n) + '\u2026' : s || '');

export default function AnalyticsScreen() {
  const { analytics, analyticsLoading, refreshAnalytics, loadWrapped, online } = useData();
  const currentYear = new Date().getFullYear();
  const [wrappedYear, setWrappedYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState<any>(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const fetchWrapped = useCallback(async (year: number) => {
    setWrappedLoading(true);
    try { setWrapped(await loadWrapped(year)); }
    catch { setWrapped(null); }
    finally { setWrappedLoading(false); }
  }, [loadWrapped]);

  const onRefresh = useCallback(async () => {
    await refreshAnalytics();
    await fetchWrapped(wrappedYear);
  }, [refreshAnalytics, fetchWrapped, wrappedYear]);

  useEffect(() => { fetchWrapped(wrappedYear); }, [wrappedYear, online, fetchWrapped]);

  const songChartData = (analytics?.top_songs || []).slice(0, 5)
    .map((s: any) => ({ label: truncate(s.title, 10), value: s.play_count }));
  const artistChartData = (analytics?.top_artists || []).slice(0, 5)
    .map((a: any) => ({ label: truncate(a.artist, 10), value: Math.round((a.total_time || 0) / 60) }));
  const wrappedChartData = (wrapped?.top_songs || []).slice(0, 5)
    .map((s: any) => ({ label: truncate(s.title, 8), value: s.play_count }));

  return (
    <ScrollPage onRefresh={onRefresh}>
      <div className="page-pad">
        <h1 className="heading">Analytics</h1>
        {!online && analytics && <div className="offline-note">Offline: showing last synced stats.</div>}

        {analyticsLoading && !analytics ? (
          <div className="muted">Loading analytics...</div>
        ) : !analytics ? (
          <div className="muted">No analytics data</div>
        ) : (
          <>
            <div className="stats-row">
              <StatCard value={analytics.total_plays} label="Total Plays" />
              <StatCard value={fmtListeningTime(analytics.total_listening_time)} label="Listening Time" />
            </div>

            <div className="section-sub">Top Songs</div>
            {songChartData.length === 0
              ? <div className="muted">No plays yet</div>
              : <Chart data={songChartData} height={180} color="rgba(29,185,84,1)" />}

            <div className="section-sub">Top Artists (min)</div>
            {artistChartData.length === 0
              ? <div className="muted">No artist data</div>
              : <Chart data={artistChartData} height={180} color="rgba(30,215,96,1)" />}
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <div className="section-sub">Yearly Stats {wrappedYear}</div>
          <div className="year-picker">
            {years.map(y => (
              <button key={y} className={`year-btn ${wrappedYear === y ? 'active' : ''}`} onClick={() => setWrappedYear(y)}>
                {y}
              </button>
            ))}
          </div>
        </div>

        {wrappedLoading && !wrapped ? <div className="muted">Loading...</div> : wrapped ? (
          <>
            <div className="stats-row">
              <StatCard value={wrapped.total_plays} label="Plays" />
              <StatCard value={fmtListeningTime(wrapped.total_listening_time)} label="Time" />
            </div>
            {wrappedChartData.length > 0 && <Chart data={wrappedChartData} height={150} color="rgba(29,185,84,1)" />}
          </>
        ) : <div className="muted">No data for {wrappedYear}</div>}

        <div style={{ height: 120 }} />
      </div>
    </ScrollPage>
  );
}
