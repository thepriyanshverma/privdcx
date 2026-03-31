import { memo } from 'react';

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function heatColorFromMetrics(metrics = {}) {
  const t = Number(metrics.temperature);
  const p = Number(metrics.power);
  const tempFactor = clamp01((t - 25) / 35);
  const powerFactor = clamp01(p / 25);
  const score = clamp01((tempFactor * 0.65) + (powerFactor * 0.35));
  if (score > 0.82) return '#ff4f4f';
  if (score > 0.65) return '#ff7b3d';
  if (score > 0.48) return '#ffb020';
  if (score > 0.3) return '#8fd3ff';
  return '#35d8ff';
}

function blastRackColor(level = 0, maxLevel = 1) {
  const safeMax = Math.max(1, Number(maxLevel || 1));
  const ratio = clamp01(Number(level || 0) / safeMax);
  if (ratio <= 0.2) return '#ff5c5c';
  if (ratio <= 0.45) return '#ff8d4d';
  if (ratio <= 0.7) return '#ffb956';
  return '#ffd889';
}

function resolveRackColor({
  rack,
  hoveredEntityId,
  selectedEntityId,
  heatmapMode,
  blastMode,
  blastData,
  rootCauseEntityId,
}) {
  if (rootCauseEntityId && rack.id === rootCauseEntityId) return '#ff5c5c';
  if (blastMode && blastData?.impactedSet?.has(rack.id)) {
    const maxLevel = Math.max(1, ...Array.from(blastData.levels.values()));
    return blastRackColor(blastData.levels.get(rack.id) || 1, maxLevel);
  }
  if (selectedEntityId === rack.id) return '#79ecff';
  if (hoveredEntityId === rack.id) return '#4ecde8';
  if (heatmapMode) return heatColorFromMetrics(rack.userData?.metrics || {});
  return '#35d8ff';
}

function resolveRackEmissive({
  rack,
  hoveredEntityId,
  selectedEntityId,
  blastMode,
  blastData,
  rootCauseEntityId,
}) {
  if (rootCauseEntityId && rack.id === rootCauseEntityId) return '#ff3f3f';
  if (blastMode && blastData?.impactedSet?.has(rack.id)) return '#ff6a44';
  if (selectedEntityId === rack.id) return '#2fcde6';
  if (hoveredEntityId === rack.id) return '#1f8098';
  return '#0b2530';
}

export default memo(function RackLayer({
  racks = [],
  hoveredEntityId = '',
  selectedEntityId = '',
  heatmapMode = false,
  blastMode = false,
  blastData = null,
  rootCauseEntityId = '',
  onHover,
  onSelect,
  onFocus,
}) {
  if (!Array.isArray(racks) || racks.length === 0) return null;

  return (
    <group>
      {racks.map((rack) => {
        const color = resolveRackColor({
          rack,
          hoveredEntityId,
          selectedEntityId,
          heatmapMode,
          blastMode,
          blastData,
          rootCauseEntityId,
        });
        const emissive = resolveRackEmissive({
          rack,
          hoveredEntityId,
          selectedEntityId,
          blastMode,
          blastData,
          rootCauseEntityId,
        });
        return (
          <group key={rack.id} position={[rack.x, rack.y, rack.z]}>
            <mesh
              castShadow
              receiveShadow
              userData={rack.userData}
              onPointerMove={(event) => {
                event.stopPropagation();
                if (onHover) onHover(rack.userData, event);
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                if (onHover) onHover(null, event);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (onSelect) onSelect(rack.userData, event);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (onFocus) onFocus(rack.userData, event);
              }}
            >
              <boxGeometry args={[rack.width, rack.height, rack.depth]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={0.35}
                roughness={0.38}
                metalness={0.2}
              />
            </mesh>
            <mesh position={[0, rack.height / 2 + 0.02, 0]} userData={rack.userData}>
              <boxGeometry args={[rack.width * 1.02, 0.04, rack.depth * 1.02]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={0.18}
                roughness={0.45}
                metalness={0.1}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

