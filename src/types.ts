export interface HaikuMonument {
  id: number;
  text: string;
  established_date: string;
  commentary: string;
  image_url: string;
  created_at: string;
  updated_at: string;
  poet_id: number;
  source_id: number;
  location_id: number;
  poets: Array<{
    id: number;
    name: string;
    biography: string;
    links: string;
    image_url: string;
    created_at: string;
    updated_at: string;
  }>;
  sources: Array<{
    id: number;
    title: string;
    author: string;
    year: number;
    url: string;
    publisher: string;
    created_at: string;
    updated_at: string;
  }>;
  locations: Array<{
    id: number;
    prefecture: string;
    region: string;
    address: string;
    latitude: number;
    longitude: number;
    name: string;
  }>;
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
    text: string;
    established_date: string;
    commentary: string;
    image_url: string;
    poet_name: string;
    prefecture: string;
    region: string;
    address: string;
    name: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
} 