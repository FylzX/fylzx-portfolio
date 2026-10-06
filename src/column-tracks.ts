import { damp, type Spring } from "./motion.ts";

// Each column owns its physical scroll position. Lateral navigation never
// recenters the destination column or moves the other columns.
export class ColumnTracks {
  readonly tracks: (Spring & { target: number })[];
  private selected: { lane: number; row: number };
  constructor(rows: number[], lane: number, row: number) {
    this.tracks = rows.map((value) => ({ value, velocity: 0, target: value }));
    this.selected = { lane, row };
  }
  center(lane: number) {
    return this.tracks[lane]?.value ?? 0;
  }
  adjacentRow(lane: number) {
    return Math.round(
      this.center(lane) + this.selected.row - this.center(this.selected.lane),
    );
  }
  select(lane: number, row: number) {
    if (lane === this.selected.lane) {
      const track = this.tracks[lane];
      if (track) track.target += row - this.selected.row;
    } else {
      // Freeze the source at its visible position, even during fast input.
      for (const index of [this.selected.lane, lane]) {
        const track = this.tracks[index];
        if (track) {
          track.target = track.value;
          track.velocity = 0;
        }
      }
    }
    this.selected = { lane, row };
  }
  update(dt: number, reduced: boolean) {
    const track = this.tracks[this.selected.lane];
    if (track) damp(track, track.target, reduced ? 80 : 6, dt);
  }
}
