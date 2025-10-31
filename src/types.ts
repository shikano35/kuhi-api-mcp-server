import type { z } from "zod";
import type {
  EventSchema,
  InscriptionSchema,
  LocationSchema,
  MediaSchema,
  MonumentSchema,
  PoetSchema,
  PoemsResponseSchema,
  PoetsResponseSchema,
  SearchOptionsSchema,
  SourceSchema,
  SourcesResponseSchema,
  LocationsResponseSchema,
  InscriptionsResponseSchema,
  MonumentsResponseSchema,
} from "./schemas.js";

export type Poet = z.infer<typeof PoetSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Poem = z.infer<typeof PoemsResponseSchema>["poems"][number];
export type PoemAttribution = NonNullable<
  NonNullable<Poem["attributions"]>[number]
>;
export type Inscription = z.infer<typeof InscriptionSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type Monument = z.infer<typeof MonumentSchema>;

export type MonumentsResponse = z.infer<typeof MonumentsResponseSchema>;
export type InscriptionsResponse = z.infer<typeof InscriptionsResponseSchema>;
export type PoemsResponse = z.infer<typeof PoemsResponseSchema>;
export type PoetsResponse = z.infer<typeof PoetsResponseSchema>;
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;
export type LocationsResponse = z.infer<typeof LocationsResponseSchema>;

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

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

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
