import * as THREE from "three";
import type { Photo } from "./types";

const faceGeometry = new THREE.PlaneGeometry(1, 1);
const boardGeometry = new THREE.BoxGeometry(4.8, 3.5, 0.12);
const glassGeometry = new THREE.BoxGeometry(4.94, 3.64, 0.19);

export class PhotoBoards {
  private materials = new Map<string, THREE.MeshBasicMaterial>();
  private loaded = new Map<string, Promise<void>>();
  private loader = new THREE.TextureLoader();
  private disposed = false;
  private highResolution = new Set<string>();
  readonly paper = new THREE.MeshStandardMaterial({
    color: "#f5f2ec",
    roughness: 0.78,
  });
  readonly glass = new THREE.MeshPhysicalMaterial({
    color: "#f4efe8",
    transmission: 0.65,
    thickness: 0.12,
    roughness: 0.14,
    metalness: 0,
    ior: 1.45,
    clearcoat: 1,
  });
  anisotropy = 4;
  onError?: (photo: Photo) => void;

  async load(photo: Photo, high = false) {
    const key = `${photo.id}:${high}`;
    if (this.loaded.has(key)) return this.loaded.get(key);
    const promise = (async () => {
      try {
        const texture = await this.loader.loadAsync(
          import.meta.env.BASE_URL + (high ? photo.preview : photo.thumbnail),
        );
        if (this.disposed || (!high && this.highResolution.has(photo.id))) {
          texture.dispose();
          return;
        }
        if (high) this.highResolution.add(photo.id);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        const material = this.material(photo);
        material.map?.dispose();
        material.map = texture;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      } catch {
        this.loaded.delete(key);
        this.onError?.(photo);
      }
    })();
    this.loaded.set(key, promise);
    return promise;
  }
  material(photo: Photo) {
    let material = this.materials.get(photo.id);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: "#bbb7ae",
        toneMapped: false,
      });
      this.materials.set(photo.id, material);
    }
    return material;
  }
  create(photo: Photo) {
    const group = new THREE.Group();
    const glass = new THREE.Mesh(glassGeometry, this.glass);
    glass.position.z = -0.065;
    const board = new THREE.Mesh(boardGeometry, this.paper);
    board.castShadow = true;
    board.receiveShadow = true;
    const picture = new THREE.Mesh(faceGeometry, this.material(photo));
    const scale = Math.min(4.34 / photo.width, 3.04 / photo.height);
    picture.scale.set(photo.width * scale, photo.height * scale, 1);
    picture.position.z = 0.065;
    group.add(glass, board, picture);
    void this.load(photo);
    return group;
  }
  theme(dark: boolean) {
    this.paper.color.set(dark ? "#353732" : "#f5f2ec");
    this.glass.color.set(dark ? "#939a90" : "#f4efe8");
  }
  quality(anisotropy: number, performance: boolean) {
    this.anisotropy = anisotropy;
    this.glass.transmission = performance ? 0 : 0.65;
    this.glass.needsUpdate = true;
    for (const material of this.materials.values())
      if (material.map) {
        material.map.anisotropy = anisotropy;
        material.map.needsUpdate = true;
      }
  }
  dispose() {
    this.disposed = true;
    for (const material of this.materials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.paper.dispose();
    this.glass.dispose();
  }
}
