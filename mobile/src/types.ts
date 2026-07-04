export type Intent = 'serious' | 'casual' | 'friends';
export type Provider = 'phone' | 'google' | 'apple';

export interface SessionResponse {
  user_id: string;
  is_new: boolean;
  needs_onboarding: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Photo {
  id?: string;
  url: string;
  position: number;
  moderation_status?: 'pending' | 'approved' | 'rejected';
}

export interface Profile {
  user_id: string;
  display_name: string;
  birth_date: string;
  gender: string;
  intent: Intent;
  bio: string | null;
  city: string | null;
  is_verified: boolean;
  updated_at: string;
}

export interface Me {
  user: { id: string; status: string; created_at: string; last_active_at: string };
  profile: Profile | null;
  photos: Photo[];
}

export interface Candidate {
  user_id: string;
  display_name: string;
  age: number;
  gender: string;
  intent: Intent;
  bio: string | null;
  city: string | null;
  is_verified: boolean;
  distance_km: number;
  distance_label: string;
  photos: { url: string; position: number }[];
}

export interface DiscoveryResponse {
  candidates: Candidate[];
  next_cursor_km: number | null;
}

export interface Match {
  id: string;
  chat_channel_id: string | null;
  created_at: string;
  other_user_id: string;
  display_name: string;
  city: string | null;
  is_verified: boolean;
  primary_photo: string | null;
}

export interface SwipeResult {
  matched: boolean;
  match?: { id: string; chat_channel_id: string | null; other_user_id: string };
}
