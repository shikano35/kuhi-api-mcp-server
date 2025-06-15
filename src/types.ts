interface BaseEntity {
  readonly id: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Poet extends BaseEntity {
  readonly name: string;
  readonly biography: string | null;
  readonly link_url: string | null;
  readonly image_url: string | null;
}

export interface Source extends BaseEntity {
  readonly title: string;
  readonly author: string;
  readonly publisher: string;
  readonly source_year: number;
  readonly url: string;
}

export interface Location {
  readonly id: number;
  readonly region: string;
  readonly prefecture: string;
  readonly municipality?: string | null;
  readonly address: string;
  readonly place_name?: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface HaikuMonument extends BaseEntity {
  readonly inscription: string;
  readonly commentary?: string | null;
  readonly kigo?: string;
  readonly season?: string;
  readonly is_reliable?: boolean;
  readonly has_reverse_inscription?: boolean | null;
  readonly material?: string | null;
  readonly total_height?: number | null;
  readonly width?: number | null;
  readonly depth?: number | null;
  readonly established_date: string;
  readonly established_year?: string | null;
  readonly founder?: string | null;
  readonly monument_type?: string | null;
  readonly designation_status?: string | null;
  readonly photo_url?: string | null;
  readonly photo_date?: string | null;
  readonly photographer?: string | null;
  readonly model_3d_url?: string | null;
  readonly remarks?: string | null;
  readonly poet_id: number;
  readonly source_id: number;
  readonly location_id: number;
  readonly poets: Poet[];
  readonly sources: Source[];
  readonly locations: Location[];
}

export interface HaikuMonumentResponse {
  readonly haiku_monuments: HaikuMonument[];
}

export interface GeoJSONFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "Point";
    readonly coordinates: readonly [number, number];
  };
  readonly properties: {
    readonly id: number;
    readonly inscription: string;
    readonly established_date: string;
    readonly commentary?: string | null;
    readonly photo_url?: string | null;
    readonly poet_name: string;
    readonly prefecture: string;
    readonly region: string;
    readonly address: string;
    readonly place_name?: string | null;
  };
}

export interface GeoJSONFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoJSONFeature[];
}

export interface SearchOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly ordering?: readonly string[];
  readonly search?: string;
  readonly title_contains?: string;
  readonly description_contains?: string;
  readonly name_contains?: string;
  readonly biography_contains?: string;
  readonly prefecture?: string;
  readonly region?: string;
  readonly created_at_gt?: string;
  readonly created_at_lt?: string;
  readonly updated_at_gt?: string;
  readonly updated_at_lt?: string;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly message?: string;
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface CoordinateSearchCriteria extends Coordinates {
  readonly radius: number;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
