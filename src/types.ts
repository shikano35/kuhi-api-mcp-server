// ベースエンティティ型
interface BaseEntity {
  readonly id: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// 俳人
export interface Poet extends BaseEntity {
  readonly name: string;
  readonly name_kana: string | null;
  readonly biography: string | null;
  readonly birth_year: number | null;
  readonly death_year: number | null;
  readonly link_url: string | null;
  readonly image_url: string | null;
}

// 出典
export interface Source extends BaseEntity {
  readonly citation: string;
  readonly author: string | null;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly source_year: number | null;
  readonly url: string | null;
}

// 出典
export interface SourceWithMonuments extends Source {
  readonly monuments?: readonly Monument[];
}

// 場所
export interface Location extends BaseEntity {
  readonly imi_pref_code: string | null;
  readonly region: string | null;
  readonly prefecture: string | null;
  readonly municipality: string | null;
  readonly address: string | null;
  readonly place_name: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geohash: string | null;
  readonly geom_geojson: string | null;
  readonly accuracy_m: number | null;
  readonly geojson?: string | null;
}

// 俳句
export interface Poem extends BaseEntity {
  readonly text: string;
  readonly normalized_text: string;
  readonly text_hash: string;
  readonly kigo: string | null;
  readonly season: string | null;
}

// 俳句の帰属
export interface PoemAttribution extends BaseEntity {
  readonly poem_id: number;
  readonly poet_id: number;
  readonly confidence: string;
  readonly confidence_score: number;
  readonly source_id: number | null;
  readonly poet: Poet;
  readonly source: Source | null;
}

// 俳句
export interface PoemWithDetails extends Poem {
  readonly attributions?: readonly PoemAttribution[];
  readonly inscriptions?: readonly Inscription[];
}

// 碑文
export interface Inscription extends BaseEntity {
  readonly monument_id?: number;
  readonly side: string;
  readonly original_text: string | null;
  readonly transliteration: string | null;
  readonly reading: string | null;
  readonly language: string;
  readonly notes: string | null;
  readonly source_id: number | null;
  readonly poems?: readonly Poem[];
  readonly monument?: Monument;
  readonly source?: Source;
}

// イベント
export interface Event extends BaseEntity {
  readonly monument_id?: number;
  readonly event_type: string;
  readonly hu_time_normalized: string | null;
  readonly interval_start: string | null;
  readonly interval_end: string | null;
  readonly uncertainty_note: string | null;
  readonly actor: string | null;
  readonly source: Source | null;
}

// メディア
export interface Media extends BaseEntity {
  readonly monument_id?: number;
  readonly media_type: string;
  readonly url: string;
  readonly iiif_manifest_url: string | null;
  readonly captured_at: string | null;
  readonly photographer: string | null;
  readonly license: string | null;
  readonly exif_json?: string | null;
}

// 句碑
export interface Monument extends BaseEntity {
  readonly canonical_name: string;
  readonly canonical_uri: string;
  readonly monument_type: string | null;
  readonly monument_type_uri: string | null;
  readonly material: string | null;
  readonly material_uri: string | null;
  readonly inscriptions?: readonly Inscription[] | undefined;
  readonly events?: readonly Event[] | undefined;
  readonly media?: readonly Media[] | undefined;
  readonly locations?: readonly Location[] | undefined;
  readonly poets?: readonly Poet[] | undefined;
  readonly sources?: readonly Source[] | undefined;
  readonly original_established_date: string | null;
  readonly hu_time_normalized: string | null;
  readonly interval_start: string | null;
  readonly interval_end: string | null;
  readonly uncertainty_note: string | null;
}

// API レスポンス
export interface MonumentsResponse {
  readonly monuments: readonly Monument[];
}

export interface InscriptionsResponse {
  readonly inscriptions: readonly Inscription[];
}

export interface PoemsResponse {
  readonly poems: readonly PoemWithDetails[];
}

export interface PoetsResponse {
  readonly poets: readonly Poet[];
}

export interface SourcesResponse {
  readonly sources: readonly Source[];
}

export interface LocationsResponse {
  readonly locations: readonly Location[];
}

// GeoJSON 関連
export interface GeoJSONFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "Point";
    readonly coordinates: readonly [number, number];
  };
  readonly properties: {
    readonly id: number;
    readonly inscription: string;
    readonly canonical_name: string;
    readonly commentary: string | null;
    readonly media_url: string | null;
    readonly poet_name: string;
    readonly prefecture: string | null;
    readonly region: string | null;
    readonly address: string | null;
    readonly place_name: string | null;
  };
}

export interface GeoJSONFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoJSONFeature[];
}

// 検索オプション
export interface SearchOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly ordering?: string;
  readonly q?: string;
  readonly search?: string;
  readonly inscription_contains?: string;
  readonly commentary_contains?: string;
  readonly poet_name_contains?: string;
  readonly poet_id?: number;
  readonly kigo?: string;
  readonly season?: string;
  readonly material?: string;
  readonly monument_type?: string;
  readonly prefecture?: string;
  readonly region?: string;
  readonly location_id?: number;
  readonly bbox?: string;
  readonly established_start?: string;
  readonly established_end?: string;
  readonly has_media?: string;
  readonly uncertain?: string;
  readonly expand?: string;
  readonly text_contains?: string;
  readonly name_contains?: string;
  readonly biography_contains?: string;
  readonly title_contains?: string;
  readonly author_contains?: string;
  readonly created_at_gt?: string;
  readonly created_at_lt?: string;
  readonly updated_at_gt?: string;
  readonly updated_at_lt?: string;
  readonly monument_id?: number;
  readonly language?: string;
}

// API レスポンス
export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly message?: string;
}

// 座標関連
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface CoordinateSearchCriteria extends Coordinates {
  readonly radius: number;
}

// エラー
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
