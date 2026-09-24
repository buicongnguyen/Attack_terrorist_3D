import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Materials the game recolours or animates at runtime keep their own meshes.
const KEEP = new Set(["Hostile accent", "Livery", "Car paint", "Beacon light"]);

function mergeable(mesh) {
  const m = mesh.material;
  if (!mesh.isMesh || Array.isArray(m) || !m?.isMeshStandardMaterial) return false;
  if (KEEP.has(m.name) || m.transparent || m.alphaTest > 0) return false;
  const glows = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 0.001;
  return !glows;
}

function prepared(mesh) {
  let g = mesh.geometry.clone();
  if (g.index) g = g.toNonIndexed();
  mesh.updateMatrix();
  g.applyMatrix4(mesh.matrix);
  const count = g.attributes.position.count;
  const color = mesh.material.color;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.attributes.position);
  out.setAttribute("normal", g.attributes.normal);
  out.setAttribute("uv", g.attributes.uv || new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return out;
}

// Merge the static meshes under each pivot that share a texture and finish into one
// vertex-coloured mesh. Colour moves from the material to the vertices, so the look is
// unchanged while a soldier drops from ~19 draw calls to ~8.
export function consolidate(root) {
  const pivots = [root];
  root.traverse((node) => {
    if (node !== root && !node.isMesh) pivots.push(node);
  });
  let merged = 0;
  for (const pivot of pivots) {
    const groups = new Map();
    for (const child of pivot.children) {
      if (!mergeable(child)) continue;
      const m = child.material;
      // Glossy parts (glass, lacquer) stay apart from matte ones; finer differences vanish at game scale.
      const key = `${m.map?.uuid || "-"}|${m.roughness < 0.3 ? "gloss" : "matte"}|${m.side}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geometry = mergeGeometries(meshes.map(prepared), false);
      if (!geometry) continue;
      const source = meshes[0].material;
      const average = (key) => meshes.reduce((sum, m) => sum + m.material[key], 0) / meshes.length;
      const material = new THREE.MeshStandardMaterial({
        name: `${pivot.name || "root"} merged`,
        vertexColors: true,
        map: source.map,
        roughness: average("roughness"),
        metalness: average("metalness"),
        side: source.side,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${pivot.name || "root"}_merged`;
      mesh.castShadow = mesh.receiveShadow = true;
      for (const m of meshes) pivot.remove(m);
      pivot.add(mesh);
      merged += meshes.length - 1;
    }
  }
  return merged;
}
