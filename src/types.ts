export interface Photo {
  id: string;
  filename: string;
  date: string;
  year: number;
  month: string;
  collection: string;
  sequence: number;
  preview: string;
  thumbnail?: string;
  width: number;
  height: number;
  exif: { label: string; value: string }[];
  description: string;
}
export interface Gallery {
  collections: {
    id: string;
    label: string;
    startMonth: string;
    endMonth: string;
  }[];
  photos: Photo[];
}
export type Preferences = {
  dark: boolean;
  quality: "performance" | "original" | "high" | "ultra";
  reduced: boolean;
};
