import { test } from "node:test";
import assert from "node:assert/strict";
import { GalleryNavigation } from "../src/navigation.ts";
const gallery = {
  collections: [{ id: "2024-01" }, { id: "2025-03" }, { id: "2026-09" }],
  photos: [
    { id: "a", collection: "2024-01" },
    { id: "b", collection: "2024-01" },
    { id: "middle", collection: "2025-03" },
    { id: "c", collection: "2026-09" },
    { id: "d", collection: "2026-09" },
    { id: "e", collection: "2026-09" },
  ],
};
test("latest photo, finite collections, looping photos and lateral moves preserve physical row", () => {
  const n = new GalleryNavigation(gallery);
  assert.equal(n.current.id, "e");
  assert.equal(n.collection(1), false);
  assert.equal(n.lane, 2);
  n.photo(1);
  assert.equal(n.current.id, "c");
  n.photo(-1);
  assert.equal(n.current.id, "e");
  n.collection(-1);
  assert.equal(n.current.id, "middle");
  n.photo(1);
  assert.equal(n.current.id, "middle");
  n.collection(-1);
  assert.equal(n.current.id, "b");
  assert.equal(n.collection(-1), false);
  n.photo(1);
  assert.equal(n.current.id, "a");
  n.collection(1);
  n.collection(1);
  assert.equal(n.current.id, "d");
  assert.equal(n.row, 4);
  n.photo(300);
  const row = n.row;
  const adjacent = n.at(n.lane - 1, row);
  n.collection(-1);
  assert.equal(n.row, row);
  assert.equal(n.current.id, adjacent.id);
  assert.equal(n.at(-1, 0), undefined);
  assert.equal(n.at(3, 0), undefined);
});
test("empty collection and single photograph stay navigable", () => {
  const n = new GalleryNavigation({ collections: [], photos: [] });
  assert.equal(n.current, undefined);
  assert.equal(n.photo(-1), false);
  assert.equal(n.collection(-1), false);
  const one = new GalleryNavigation({
    collections: [{ id: "2024-01" }],
    photos: [{ id: "solo", collection: "2024-01" }],
  });
  one.photo(100);
  assert.equal(one.current.id, "solo");
});
