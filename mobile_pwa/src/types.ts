export interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  file_path?: string;
  cover_path?: string;
  cover_url?: string | null;
  sort_order?: number;
  downloaded?: number;
  date_added?: string;
  play_count?: number;
  total_time?: number;
  position?: number;
}

export interface Analytics {
  top_songs: any[];
  top_artists: any[];
  total_listening_time: number;
  total_plays: number;
  recommendations: any[];
  play_history: any[];
}

export interface Artist {
  name: string;
  image_path?: string;
  image_url?: string | null;
  created_at?: string;
  song_count: number;
}

export interface Playlist {
  id: string;
  name: string;
  created_at?: string;
  song_count: number;
  cover_url?: string | null;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  created_at?: string;
  is_wrapped: boolean;
  songs: Song[];
}
