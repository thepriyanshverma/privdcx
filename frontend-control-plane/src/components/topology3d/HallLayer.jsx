import { memo, useMemo } from 'react';
import { Html } from '@react-three/drei';

function resolveBlastHallColor(level = 0, maxLevel = 1) {
  const safeMax = Math.max(1, Number(maxLevel || 1));
  const ratio = Math.max(0, Math.min(1, Number(level || 0) / safeMax));
  if (ratio <= 0.2) return '#ff5c5c';
  if (ratio <= 0.45) return '#ff8f4f';
  if (ratio <= 0.7) return '#ffb156';
  return '#ffd27a';
}

function hallColor({
  hallId,
  hoveredEntityId,
  selectedEntityId,
  blastMode,
  blastData,
  rootCauseEntityId,
  maxBlastLevel,
}) {
  if (rootCauseEntityId && hallId === rootCauseEntityId) return '#ff5c5c';

  if (blastMode && blastData?.impactedSet?.has(hallId)) {
    return resolveBlastHallColor(Number(blastData.levels.get(hallId) || 1), maxBlastLevel);
  }

  if (selectedEntityId === hallId) return '#6ea9ff';
  if (hoveredEntityId === hallId) return '#4f87ce';
  return '#2f5478';
}

function hallEmissive({
  hallId,
  hoveredEntityId,
  selectedEntityId,
  blastMode,
  blastData,
  rootCauseEntityId,
}) {
  if (rootCauseEntityId && hallId === rootCauseEntityId) return '#ff3d3d';
  if (blastMode && blastData?.impactedSet?.has(hallId)) return '#ff6a3d';
  if (selectedEntityId === hallId) return '#3d7ae6';
  if (hoveredEntityId === hallId) return '#2f639f';
  return '#142433';
}

export default memo(function HallLayer({
  halls = [],
  hoveredEntityId = '',
  selectedEntityId = '',
  blastMode = false,
  blastData = null,
  rootCauseEntityId = '',
  onHover,
  onSelect,
  onFocus,
}) {
  const maxBlastLevel = useMemo(
    () => Math.max(1, ...(blastData?.levels ? Array.from(blastData.levels.values()) : [1])),
    [blastData]
  );

  if (!Array.isArray(halls) || halls.length === 0) return null;

  return (
    <group>
      {halls.map((hall) => {
        const color = hallColor({
          hallId: hall.id,
          hoveredEntityId,
          selectedEntityId,
          blastMode,
          blastData,
          rootCauseEntityId,
          maxBlastLevel,
        });
        const emissive = hallEmissive({
          hallId: hall.id,
          hoveredEntityId,
          selectedEntityId,
          blastMode,
          blastData,
          rootCauseEntityId,
        });

        return (
          <group key={hall.id} position={[hall.x, hall.y, hall.z]}>
            <mesh
              castShadow={false}
              receiveShadow={false}
              userData={hall.userData}
              onPointerMove={(event) => {
                event.stopPropagation();
                if (onHover) onHover(hall.userData, event);
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                if (onHover) onHover(null, event);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (onSelect) onSelect(hall.userData, event);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (onFocus) onFocus(hall.userData, event);
              }}
            >
              <boxGeometry args={[hall.width, hall.height, hall.depth]} />
              <meshStandardMaterial
                color={color}
                transparent
                opacity={0.24}
                emissive={emissive}
                emissiveIntensity={0.45}
                roughness={0.72}
                metalness={0.18}
              />
            </mesh>
            <mesh position={[0, hall.height / 2 + 0.01, 0]}>
              <boxGeometry args={[hall.width, 0.02, hall.depth]} />
              <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.18} />
            </mesh>
            <Html position={[0, hall.height / 2 + 1.05, 0]} center distanceFactor={24} transform={false}>
              <div className="topology-3d-label">{hall.name}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
});
