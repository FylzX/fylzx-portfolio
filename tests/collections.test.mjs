import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupPhotos,
  loadCollections,
  validateCollections,
} from "../scripts/collections.mjs";

test("whole months stay together across exact boundaries; 2024 is one group", async () => {
  const rules = await loadCollections();
  const dates = [
    "2024-01-01",
    "2024-12-31",
    "2025-01-01",
    "2025-01-31",
    "2025-02-01",
    "2025-03-31",
    "2025-04-01",
    "2025-07-31",
    "2025-08-01",
    "2025-12-31",
    "2026-01-01",
    "2026-12-31",
  ];
  const grouped = groupPhotos(
    dates.map((date) => ({ date })),
    rules,
  );
  assert.equal(grouped.collections.length, 6);
  assert.deepEqual(
    grouped.photos.map((photo) => photo.collection),
    rules.flatMap((rule) => [rule.id, rule.id]),
  );
  assert.deepEqual(groupPhotos([], rules), { collections: [], photos: [] });
  assert.equal(
    groupPhotos([{ date: "2027-03-01" }, { date: "2027-08-01" }], rules)
      .collections.length,
    1,
  );
});

test("invalid day boundaries and overlapping month ranges are rejected", () => {
  const group = {
    id: "a",
    label: "A",
    startMonth: "2025-01",
    endMonth: "2025-03",
  };
  assert.throws(
    () => validateCollections([{ ...group, startMonth: "2025-01-15" }]),
    /月份/,
  );
  assert.throws(
    () =>
      validateCollections([
        group,
        { ...group, id: "b", startMonth: "2025-03", endMonth: "2025-04" },
      ]),
    /重叠/,
  );
});
