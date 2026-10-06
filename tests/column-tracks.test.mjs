import { test } from "node:test";
import assert from "node:assert/strict";
import { ColumnTracks } from "../src/column-tracks.ts";

test("scrolling a column leaves both neighbours fixed; lateral selection uses the visible neighbour", () => {
  const tracks = new ColumnTracks([7, 26, 11], 2, 11);
  tracks.select(2, 45);
  for (let i = 0; i < 180; i++) tracks.update(1 / 60, false);
  assert.equal(tracks.center(0), 7);
  assert.equal(tracks.center(1), 26);
  const neighbour = tracks.adjacentRow(1);
  assert.equal(neighbour, 26);
  const before = tracks.tracks.map((track) => track.value);
  tracks.select(1, neighbour);
  for (let i = 0; i < 120; i++) tracks.update(1 / 60, false);
  assert.deepEqual(
    tracks.tracks.map((track) => track.value),
    before,
  );
  assert.equal(tracks.adjacentRow(2), 45);
});
test("switching mid-scroll chooses the adjacent physical slot and freezes all column offsets", () => {
  const tracks = new ColumnTracks([8, 23], 0, 8);
  tracks.select(0, 12);
  tracks.update(0.05, false);
  const before = tracks.tracks.map((track) => track.value);
  const neighbour = tracks.adjacentRow(1);
  assert.equal(neighbour, Math.round(23 + 12 - before[0]));
  tracks.select(1, neighbour);
  tracks.update(1, false);
  assert.deepEqual(
    tracks.tracks.map((track) => track.value),
    before,
  );
});
