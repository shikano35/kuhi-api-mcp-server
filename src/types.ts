export interface HaikuMonument {
  id: number;
  inscription: string;
  commentary: string;
  kigo?: string;
  season?: string;
  is_reliable?: boolean;
  has_reverse_inscription?: boolean;
  material?: string | null;
  total_height?: number | null;
  width?: number | null;
  depth?: number | null;
  established_date: string;
  established_year?: string;
  founder?: string;
  monument_type?: string;
  designation_status?: string | null;
  photo_url?: string | null;
  photo_date?: string | null;
  photographer?: string | null;
  model_3d_url?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
  poet_id: number;
  source_id: number;
  location_id: number;
  poets: Poet[];
  sources: Source[];
  locations: Location[];
}

export interface Poet {
  id: number;
  name: string;
  biography: string;
  link_url: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: number;
  title: string;
  author: string;
  publisher: string;
  source_year: number;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  region: string;
  prefecture: string;
  municipality?: string;
  address: string;
  place_name?: string;
  latitude: number;
  longitude: number;
}

export interface HaikuMonumentResponse {
  haiku_monuments: HaikuMonument[];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: number;
    inscription: string;
    established_date: string;
    commentary: string;
    photo_url?: string | null;
    poet_name: string;
    prefecture: string;
    region: string;
    address: string;
    place_name?: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  ordering?: string[];
  search?: string;
  title_contains?: string;
  description_contains?: string;
  name_contains?: string;
  biography_contains?: string;
  prefecture?: string;
  region?: string;
  created_at_gt?: string;
  created_at_lt?: string;
  updated_at_gt?: string;
  updated_at_lt?: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}
