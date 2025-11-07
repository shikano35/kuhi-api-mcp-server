import { z } from "zod";

const VALIDATION_LIMITS = {
  MAX_LIMIT: 1000,
  MIN_LIMIT: 1,
  MIN_OFFSET: 0,
  LAT_MIN: -90,
  LAT_MAX: 90,
  LON_MIN: -180,
  LON_MAX: 180,
  MIN_RADIUS: 0,
  RADIUS_MAX: 50000,
} as const;

const IdSchema = z.number().int().positive();
const TimestampSchema = z.string().optional().default("");
const OptionalStringSchema = z.string().nullable().optional().default(null);
const OptionalNumberSchema = z.number().nullable().optional().default(null);

// 俳人のスキーマ
export const PoetSchema = z.object({
  id: IdSchema,
  name: z.string(),
  name_kana: OptionalStringSchema,
  biography: OptionalStringSchema,
  birth_year: z.number().int().nullable().optional(),
  death_year: z.number().int().nullable().optional(),
  link_url: OptionalStringSchema,
  image_url: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

// 出典のスキーマ
export const SourceSchema = z.object({
  id: IdSchema,
  citation: z.string(),
  author: OptionalStringSchema,
  title: OptionalStringSchema,
  publisher: OptionalStringSchema,
  source_year: z.number().int().nullable().optional(),
  url: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

// 場所のスキーマ
export const LocationSchema = z.object({
  id: IdSchema,
  imi_pref_code: OptionalStringSchema,
  region: OptionalStringSchema,
  prefecture: OptionalStringSchema,
  municipality: OptionalStringSchema,
  address: OptionalStringSchema,
  place_name: OptionalStringSchema,
  latitude: z
    .number()
    .min(VALIDATION_LIMITS.LAT_MIN)
    .max(VALIDATION_LIMITS.LAT_MAX)
    .nullable(),
  longitude: z
    .number()
    .min(VALIDATION_LIMITS.LON_MIN)
    .max(VALIDATION_LIMITS.LON_MAX)
    .nullable(),
  geohash: OptionalStringSchema,
  geom_geojson: OptionalStringSchema,
  accuracy_m: OptionalNumberSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  geojson: OptionalStringSchema,
});

// 俳句のスキーマ
export const PoemSchema = z.object({
  id: IdSchema,
  text: z.string(),
  normalized_text: z.string(),
  text_hash: z.string(),
  kigo: OptionalStringSchema,
  season: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

// 俳句の帰属スキーマ
export const PoemAttributionSchema = z.object({
  id: IdSchema,
  poem_id: IdSchema,
  poet_id: IdSchema,
  confidence: z.string().default("certain"),
  confidence_score: z.number().default(1),
  source_id: z.number().nullable().optional(),
  created_at: TimestampSchema,
  poet: PoetSchema,
  source: SourceSchema.nullable(),
});

// 基本Monumentスキーマ
const BaseMonumentSchema = z.object({
  id: IdSchema,
  canonical_name: z.string(),
  canonical_uri: z.string(),
  monument_type: OptionalStringSchema,
  monument_type_uri: OptionalStringSchema,
  material: OptionalStringSchema,
  material_uri: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

// 碑文のスキーマ
export const InscriptionSchema = z.object({
  id: IdSchema,
  monument_id: IdSchema.optional(),
  side: z.string().optional().default("front"),
  original_text: OptionalStringSchema,
  transliteration: OptionalStringSchema,
  reading: OptionalStringSchema,
  language: z.string().default("ja"),
  notes: OptionalStringSchema,
  source_id: z.number().nullable().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  poems: z.array(PoemSchema).optional(),
  source: SourceSchema.optional(),
  monument: BaseMonumentSchema.optional(),
});

// イベントのスキーマ
export const EventSchema = z.object({
  id: IdSchema,
  monument_id: IdSchema.optional(),
  event_type: z.string(),
  hu_time_normalized: OptionalStringSchema,
  interval_start: OptionalStringSchema,
  interval_end: OptionalStringSchema,
  uncertainty_note: OptionalStringSchema,
  actor: OptionalStringSchema,
  source: SourceSchema.nullable(),
});

// メディアのスキーマ
export const MediaSchema = z.object({
  id: IdSchema,
  monument_id: IdSchema.optional(),
  media_type: z.string(),
  url: z.string(),
  iiif_manifest_url: OptionalStringSchema,
  captured_at: OptionalStringSchema,
  photographer: OptionalStringSchema,
  license: OptionalStringSchema,
  exif_json: OptionalStringSchema.optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

// 句碑のスキーマ
export const MonumentSchema = z.object({
  id: IdSchema,
  canonical_name: z.string(),
  canonical_uri: z.string(),
  monument_type: OptionalStringSchema,
  monument_type_uri: OptionalStringSchema,
  material: OptionalStringSchema,
  material_uri: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  inscriptions: z.array(InscriptionSchema).optional(),
  events: z.array(EventSchema).optional(),
  media: z.array(MediaSchema).optional(),
  locations: z.array(LocationSchema).optional(),
  poets: z.array(PoetSchema).optional(),
  sources: z.array(SourceSchema).optional(),
  original_established_date: OptionalStringSchema,
  hu_time_normalized: OptionalStringSchema,
  interval_start: OptionalStringSchema,
  interval_end: OptionalStringSchema,
  uncertainty_note: OptionalStringSchema,
});

// レスポンススキーマ
export const MonumentsResponseSchema = z.array(MonumentSchema);

export const InscriptionsResponseSchema = z.object({
  inscriptions: z.array(InscriptionSchema),
});

export const PoemsResponseSchema = z.object({
  poems: z.array(
    PoemSchema.extend({
      attributions: z.array(PoemAttributionSchema).optional().default([]),
      inscriptions: z.array(InscriptionSchema).optional().default([]),
    }),
  ),
});

// 新APIレスポンススキーマ
export const SourcesResponseSchema = z.array(SourceSchema);
export const LocationsResponseSchema = z.array(LocationSchema);
export const PoetsResponseSchema = z.array(PoetSchema);

// 拡張Sourceスキーマ
export const SourceWithMonumentsSchema = SourceSchema.extend({
  monuments: z
    .array(
      BaseMonumentSchema.extend({
        original_established_date: OptionalStringSchema,
        hu_time_normalized: OptionalStringSchema,
        interval_start: OptionalStringSchema,
        interval_end: OptionalStringSchema,
        uncertainty_note: OptionalStringSchema,
      }),
    )
    .optional(),
});

// 検索オプションスキーマ
export const SearchOptionsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(VALIDATION_LIMITS.MIN_LIMIT)
    .max(VALIDATION_LIMITS.MAX_LIMIT)
    .optional(),
  offset: z.number().int().min(VALIDATION_LIMITS.MIN_OFFSET).optional(),
  ordering: z.string().optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  inscription_contains: z.string().optional(),
  commentary_contains: z.string().optional(),
  poet_name_contains: z.string().optional(),
  poet_id: z.number().optional(),
  kigo: z.string().optional(),
  season: z.string().optional(),
  material: z.string().optional(),
  monument_type: z.string().optional(),
  prefecture: z.string().optional(),
  municipality: z.string().optional(),
  region: z.string().optional(),
  location_id: z.number().optional(),
  bbox: z.string().optional(),
  established_start: z.string().optional(),
  established_end: z.string().optional(),
  has_media: z.string().optional(),
  uncertain: z.string().optional(),
  expand: z.string().optional(),
  text_contains: z.string().optional(),
  name_contains: z.string().optional(),
  biography_contains: z.string().optional(),
  title_contains: z.string().optional(),
  author_contains: z.string().optional(),
  created_at_gt: z.string().optional(),
  created_at_lt: z.string().optional(),
  updated_at_gt: z.string().optional(),
  updated_at_lt: z.string().optional(),
  monument_id: z.number().optional(),
  language: z.string().optional(),
});

export const SeasonEnum = z.enum(["春", "夏", "秋", "冬"]);
export const RegionEnum = z.enum([
  "北海道",
  "東北",
  "関東甲信",
  "東海",
  "北陸",
  "近畿",
  "中国",
  "四国",
  "九州",
  "沖縄",
]);

// Legacy compatibility
export const HaikuMonumentSchema = MonumentSchema;
export const HaikuMonumentResponseSchema = z.object({
  haiku_monuments: z.array(MonumentSchema),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type Season = z.infer<typeof SeasonEnum>;
export type Region = z.infer<typeof RegionEnum>;
export type Poet = z.infer<typeof PoetSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type SourceWithMonuments = z.infer<typeof SourceWithMonumentsSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Poem = z.infer<typeof PoemSchema>;
export type PoemAttribution = z.infer<typeof PoemAttributionSchema>;
export type Inscription = z.infer<typeof InscriptionSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type Monument = z.infer<typeof MonumentSchema>;
