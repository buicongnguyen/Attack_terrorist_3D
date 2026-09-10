export const RESCUE_BASE = { x: 0, z: 18 };
export const RESCUE_BOUNDS = { left: -46, right: 46, near: 26, far: -224 };
export const RESCUE_HEIGHT = 7.5;
export const RESCUE_RADIUS = 4.2;
export const WINCH_SECONDS = 3;
export const RESCUE_GEAR = Object.freeze({ rockets: 14, guided: 6, flares: 4 });

const sites = [
  { x: -23, z: -30, name: "ECHO 01", sector: "LOWLAND OUTPOST" },
  { x: 25, z: -91, name: "ECHO 02", sector: "BROKEN CROSSING" },
  { x: -25, z: -151, name: "ECHO 03", sector: "HIGH VALLEY" },
  { x: 23, z: -204, name: "ECHO 04", sector: "NORTH RIDGE" },
];

export function rescueLayout(team = 2) {
  const survivors = sites.slice(0, team).map((s) => ({ ...s }));
  return {
    bounds: { ...RESCUE_BOUNDS },
    base: { ...RESCUE_BASE },
    survivors,
    supplies: survivors.flatMap((s, i) => [
      { x: s.x * 0.45, z: s.z + 12, kind: "health" },
      { x: -s.x * 0.6, z: s.z + 17, kind: i % 2 ? "ammo" : "support" },
    ]),
  };
}

export function hoverReady(position, velocity, destination, threat = false) {
  return (
    !threat &&
    Math.hypot(position.x - destination.x, position.z - destination.z) <=
      RESCUE_RADIUS &&
    Math.hypot(velocity.x, velocity.z) < 1.6
  );
}

export function rescueProgress(rescued, total, distanceToBase) {
  if (!total) return 0;
  return Math.min(
    0.99,
    (rescued / total) * 0.8 +
      (rescued === total ? 0.19 * Math.max(0, 1 - distanceToBase / 220) : 0),
  );
}

export const isHostileEntity = (e) =>
  !e.dead &&
  !e.friendly &&
  ["mine", "cannon", "launcher", "enemy", "cave", "aa-truck", "drone"].includes(
    e.type,
  ) &&
  (e.type !== "cave" || !["hidden", "closed", "opening"].includes(e.phase));
