import type { Gallery, Photo } from "./types";
export const wrap = (value: number, count: number) =>
  count > 0 ? ((value % count) + count) % count : 0;

export class GalleryNavigation {
  lane: number;
  rows: number[];
  readonly columns: Photo[][];
  readonly gallery: Gallery;
  constructor(gallery: Gallery) {
    this.gallery = gallery;
    this.columns = gallery.collections.map((collection) =>
      gallery.photos.filter((photo) => photo.collection === collection.id),
    );
    const populated = this.columns
      .map((photos, lane) => (photos.length ? lane : -1))
      .filter((lane) => lane >= 0);
    this.lane = populated.at(-1) ?? 0;
    this.rows = this.columns.map((photos) => Math.max(0, photos.length - 1));
  }
  get row() {
    return this.rows[this.lane] ?? 0;
  }
  get index() {
    return wrap(this.row, this.count);
  }
  get current() {
    return this.columns[this.lane]?.[this.index] as Photo | undefined;
  }
  get count() {
    return this.columns[this.lane]?.length ?? 0;
  }
  collection(direction: number) {
    const next = Math.max(
      0,
      Math.min(this.columns.length - 1, this.lane + direction),
    );
    if (next === this.lane) return false;
    // Select the adjacent physical slot, without travelling along the photo axis.
    const row = this.row;
    this.lane = next;
    this.rows[next] = row;
    return true;
  }
  photo(direction: number) {
    if (!this.count) return false;
    this.rows[this.lane] += direction;
    return true;
  }
  select(lane: number, row: number) {
    this.lane = Math.max(0, Math.min(this.columns.length - 1, lane));
    this.rows[this.lane] = Math.round(row);
  }
  at(lane: number, row: number) {
    return this.columns[lane]?.[wrap(row, this.columns[lane]?.length ?? 0)];
  }
}
