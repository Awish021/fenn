export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserClaims {
  sub: string;
  username: string;
  is_admin: boolean;
  exp: number;
  iat: number;
  type: "access";
}

export interface UserOut {
  id: number;
  username: string;
  is_admin: boolean;
  avatar_data_url?: string;
}

export interface GroupOut {
  id: number;
  name: string;
  member_limit: number;
}

export interface GroupMemberOut {
  user_id: number;
  username: string;
  avatar_data_url?: string;
}

export interface CategoryOut {
  id: number;
  group_id: number;
  name: string;
  builtin_key?: string | null;
}

export interface ItemOut {
  id: number;
  category_id: number;
  owner_user_id: number | null;
  text: string;
  member_ids: number[];
  logo_url?: string | null;
  subtitle?: string | null;
  provider?: string | null;
  provider_id?: string | null;
  category_key?: string | null;
}

export interface VennSection {
  members: Array<{ id: number; username: string; avatar_data_url?: string }>;
  items: ItemOut[];
}

export type VennResponse = Record<string, VennSection>;

export interface CatalogItemOut {
  category_key: string;
  provider: string;
  provider_id: string;
  title: string;
  subtitle?: string | null;
  logo_url: string;
  attribution?: string | null;
  provider_url?: string | null;
  popularity_score: number;
  like_count: number;
  liked_by_user: boolean;
}

export interface CatalogLikeResponse {
  status: string;
}
