import type { Rack } from '../store/useDataCenterStore';

/**
 * SpatialIndex provides O(1) lookup for racks based on 2D floor coordinates.
 * Primarily used for "Paint Tool" and "Region Selection" performance.
 */
export class SpatialIndex {
  private grid: Map<string, string[]> = new Map();
  private cellSize: number = 2.0; // 2 meter grid cells

  constructor(racks: Record<string, Rack>) {
    this.rebuild(racks);
  }

  rebuild(racks: Record<string, Rack>) {
    this.grid.clear();
    Object.values(racks).forEach(rack => {
      const key = this.getKey(rack.position[0], rack.position[2]);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(rack.id);
    });
  }

  private getKey(x: number, z: number): string {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return `${gx},${gz}`;
  }

  /**
   * Get racks within a circular brush radius
   */
  getRacksInRadius(x: number, z: number, radius: number, racks: Record<string, Rack>): string[] {
    const found: string[] = [];
    const searchRange = Math.ceil(radius / this.cellSize);
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);

    for (let ix = -searchRange; ix <= searchRange; ix++) {
      for (let iz = -searchRange; iz <= searchRange; iz++) {
        const cell = this.grid.get(`${gx + ix},${gz + iz}`);
        if (cell) {
          cell.forEach(id => {
            const rack = racks[id];
            if (!rack) return;
            const dx = rack.position[0] - x;
            const dz = rack.position[2] - z;
            if (dx * dx + dz * dz <= radius * radius) {
              found.push(id);
            }
          });
        }
      }
    }
    return found;
  }

  /**
   * Get racks within a rectangular selection box
   */
  getRacksInBox(minX: number, minZ: number, maxX: number, maxZ: number, racks: Record<string, Rack>): string[] {
    const found: string[] = [];
    const minGX = Math.floor(minX / this.cellSize);
    const minGZ = Math.floor(minZ / this.cellSize);
    const maxGX = Math.floor(maxX / this.cellSize);
    const maxGZ = Math.floor(maxZ / this.cellSize);

    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        const cell = this.grid.get(`${gx},${gz}`);
        if (cell) {
          cell.forEach(id => {
            const rack = racks[id];
            if (!rack) return;
            if (rack.position[0] >= minX && rack.position[0] <= maxX &&
                rack.position[2] >= minZ && rack.position[2] <= maxZ) {
              found.push(id);
            }
          });
        }
      }
    }
    return found;
  }
}
