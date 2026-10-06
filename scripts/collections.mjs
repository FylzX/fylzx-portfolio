import { readFile } from "node:fs/promises";

export async function loadCollections() {
  return validateCollections(
    JSON.parse(
      await readFile(new URL("../collections.json", import.meta.url), "utf8"),
    ),
  );
}

export function validateCollections(value) {
  if (!Array.isArray(value)) throw new Error("collections.json 必须是分组数组");
  const ids = new Set();
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  const groups = value
    .map((group) => {
      if (
        !group ||
        !/^[a-zA-Z0-9-]+$/.test(group.id ?? "") ||
        typeof group.label !== "string" ||
        !group.label.trim() ||
        !monthPattern.test(group.startMonth) ||
        !monthPattern.test(group.endMonth) ||
        group.startMonth < "2024-01" ||
        group.startMonth > group.endMonth
      )
        throw new Error("分组必须提供唯一 id、名称及有效的起止月份（YYYY-MM）");
      if (ids.has(group.id)) throw new Error(`分组 id 重复：${group.id}`);
      ids.add(group.id);
      return {
        id: group.id,
        label: group.label.trim(),
        startMonth: group.startMonth,
        endMonth: group.endMonth,
      };
    })
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].startMonth <= groups[i - 1].endMonth)
      throw new Error("分组月份范围不能重叠");
  }
  return groups;
}

export function groupPhotos(photos, rules) {
  const groups = validateCollections(rules);
  const used = new Map();
  const records = photos.map((photo) => {
    const month = photo.date.slice(0, 7);
    let group = groups.find(
      (group) => month >= group.startMonth && month <= group.endMonth,
    );
    if (!group) {
      // Future years or uncovered months remain visible without creating many categories.
      const year = photo.date.slice(0, 4);
      const yearRules = groups.filter(
        (group) =>
          group.startMonth <= `${year}-12` && group.endMonth >= `${year}-01`,
      );
      group = yearRules.length
        ? {
            id: `other-${year}`,
            label: `${year} · 其他月份`,
            startMonth: `${year}-01`,
            endMonth: `${year}-12`,
          }
        : {
            id: year,
            label: year,
            startMonth: `${year}-01`,
            endMonth: `${year}-12`,
          };
    }
    used.set(group.id, group);
    return { ...photo, collection: group.id };
  });
  return {
    collections: [...used.values()].sort((a, b) =>
      a.startMonth.localeCompare(b.startMonth),
    ),
    photos: records,
  };
}
