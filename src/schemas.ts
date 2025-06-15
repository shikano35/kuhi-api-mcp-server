import { z } from "zod";

const MAX_LIMIT = 1000;

export const HaikuMonumentSchema = z.object({
  id: z.number(),
  inscription: z.string(),
  commentary: z.string(),
  kigo: z.string().optional(),
  season: z.string().optional(),
  is_reliable: z.boolean().optional(),
  has_reverse_inscription: z.boolean().optional(),
  material: z.string().nullable().optional(),
  total_height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  depth: z.number().nullable().optional(),
  established_date: z.string(),
  established_year: z.string().optional(),
  founder: z.string().optional(),
  monument_type: z.string().optional(),
  designation_status: z.string().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  photo_date: z.string().nullable().optional(),
  photographer: z.string().nullable().optional(),
  model_3d_url: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  poet_id: z.number(),
  source_id: z.number(),
  location_id: z.number(),
  poets: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      biography: z.string(),
      link_url: z.string(),
      image_url: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      author: z.string(),
      publisher: z.string(),
      source_year: z.number(),
      url: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  locations: z.array(
    z.object({
      id: z.number(),
      region: z.string(),
      prefecture: z.string(),
      municipality: z.string().optional(),
      address: z.string(),
      place_name: z.string().optional(),
      latitude: z.number(),
      longitude: z.number(),
    }),
  ),
});

export const SearchOptionsSchema = z.object({
  limit: z.number().min(1).max(MAX_LIMIT).optional(),
  offset: z.number().min(0).optional(),
  ordering: z.array(z.string()).optional(),
  search: z.string().optional(),
  title_contains: z.string().optional(),
  description_contains: z.string().optional(),
  name_contains: z.string().optional(),
  biography_contains: z.string().optional(),
  prefecture: z.string().optional(),
  region: z.string().optional(),
  created_at_gt: z.string().optional(),
  created_at_lt: z.string().optional(),
  updated_at_gt: z.string().optional(),
  updated_at_lt: z.string().optional(),
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

export const PoetSchema = z.object({
  id: z.number(),
  name: z.string(),
  biography: z.string(),
  link_url: z.string(),
  image_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SourceSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: z.string(),
  publisher: z.string(),
  source_year: z.number(),
  url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const LocationSchema = z.object({
  id: z.number(),
  region: z.string(),
  prefecture: z.string(),
  municipality: z.string().optional(),
  address: z.string(),
  place_name: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
});

export const HaikuMonumentResponseSchema = z.object({
  haiku_monuments: z.array(HaikuMonumentSchema),
});
