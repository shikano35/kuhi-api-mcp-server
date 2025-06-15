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
} as const;

const IdSchema = z.number().int().positive();
const TimestampSchema = z.string().datetime();
const OptionalStringSchema = z.string().nullable().optional();
const OptionalNumberSchema = z.number().nullable().optional();

const PoetEmbeddedSchema = z.object({
  id: IdSchema,
  name: z.string(),
  biography: z.string().nullable(),
  link_url: z.string().nullable(),
  image_url: z.string().nullable(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

const SourceEmbeddedSchema = z.object({
  id: IdSchema,
  title: z.string(),
  author: z.string(),
  publisher: z.string(),
  source_year: z.number().int(),
  url: z.string().url(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

const LocationEmbeddedSchema = z.object({
  id: IdSchema,
  region: z.string(),
  prefecture: z.string(),
  municipality: z.string().nullable().optional(),
  address: z.string(),
  place_name: z.string().nullable().optional(),
  latitude: z
    .number()
    .min(VALIDATION_LIMITS.LAT_MIN)
    .max(VALIDATION_LIMITS.LAT_MAX),
  longitude: z
    .number()
    .min(VALIDATION_LIMITS.LON_MIN)
    .max(VALIDATION_LIMITS.LON_MAX),
});

export const HaikuMonumentSchema = z.object({
  id: IdSchema,
  inscription: z.string(),
  commentary: OptionalStringSchema,
  kigo: z.string().optional(),
  season: z.string().optional(),
  is_reliable: z.boolean().optional(),
  has_reverse_inscription: z.boolean().nullable().optional(),
  material: OptionalStringSchema,
  total_height: OptionalNumberSchema,
  width: OptionalNumberSchema,
  depth: OptionalNumberSchema,
  established_date: z.string(),
  established_year: OptionalStringSchema,
  founder: OptionalStringSchema,
  monument_type: OptionalStringSchema,
  designation_status: OptionalStringSchema,
  photo_url: OptionalStringSchema,
  photo_date: OptionalStringSchema,
  photographer: OptionalStringSchema,
  model_3d_url: OptionalStringSchema,
  remarks: OptionalStringSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  poet_id: IdSchema,
  source_id: IdSchema,
  location_id: IdSchema,
  poets: z.array(PoetEmbeddedSchema),
  sources: z.array(SourceEmbeddedSchema),
  locations: z.array(LocationEmbeddedSchema),
});

export const SearchOptionsSchema = z.object({
  search: z.string().optional(),
  prefecture: z.string().optional(),
  region: z.string().optional(),
  title_contains: z.string().optional(),
  description_contains: z.string().optional(),
  name_contains: z.string().optional(),
  biography_contains: z.string().optional(),
  limit: z
    .number()
    .int()
    .min(VALIDATION_LIMITS.MIN_LIMIT)
    .max(VALIDATION_LIMITS.MAX_LIMIT)
    .optional(),
  offset: z.number().int().min(VALIDATION_LIMITS.MIN_OFFSET).optional(),
  lat: z
    .number()
    .min(VALIDATION_LIMITS.LAT_MIN)
    .max(VALIDATION_LIMITS.LAT_MAX)
    .optional(),
  lon: z
    .number()
    .min(VALIDATION_LIMITS.LON_MIN)
    .max(VALIDATION_LIMITS.LON_MAX)
    .optional(),
  radius: z.number().min(VALIDATION_LIMITS.MIN_RADIUS).optional(),
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

export const PoetSchema = PoetEmbeddedSchema;

export const SourceSchema = SourceEmbeddedSchema;

export const LocationSchema = LocationEmbeddedSchema;

export const HaikuMonumentResponseSchema = z.object({
  haiku_monuments: z.array(HaikuMonumentSchema),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type Season = z.infer<typeof SeasonEnum>;
export type Region = z.infer<typeof RegionEnum>;
