import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D } from 'three';

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function heatColor(metrics = {}, fallback = '#35d8ff') {
  const t = Number(metrics.temperature);
  const p = Number(metrics.power);
  const tempFactor = clamp01((t - 25) / 35);
  const powerFactor = clamp01(p / 25);
  const score = clamp01((tempFactor * 0.66) + (powerFactor * 0.34));
  if (score > 0.86) return '#ff4f4f';
  if (score > 0.68) return '#ff7a3c';
  if (score > 0.5) return '#ffb020';
  if (score > 0.32) return '#8fcfff';
  return fallback;
}

function blastColor(level = 0, maxLevel = 1) {
  const ratio = clamp01(Number(level || 0) / Math.max(1, Number(maxLevel || 1)));
  if (ratio <= 0.2) return '#ff5c5c';
  if (ratio <= 0.45) return '#ff8f50';
  if (ratio <= 0.7) return '#ffb75a';
  return '#ffd681';
}

function resolveDeviceColor({
  item,
  hoveredEntityId,
  selectedEntityId,
  heatmapMode,
  blastMode,
  blastData,
  rootCauseEntityId,
  maxBlastLevel,
}) {
  if (rootCauseEntityId && item.id === rootCauseEntityId) return '#ff5c5c';
  if (blastMode && blastData?.impactedSet?.has(item.id)) {
    return blastColor(blastData.levels.get(item.id) || 1, maxBlastLevel);
  }
  if (selectedEntityId === item.id) return '#dbf8ff';
  if (hoveredEntityId === item.id) return '#b8ecff';
  if (heatmapMode) return heatColor(item.userData?.metrics || {}, item.baseColor);
  return item.baseColor;
}

export default memo(function DeviceLayer({
  devices = [],
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
  const meshRef = useRef(null);
  const dummy = useMemo(() => new Object3D(), []);
  const maxBlastLevel = useMemo(
    () => Math.max(1, ...(blastData?.levels ? Array.from(blastData.levels.values()) : [1])),
    [blastData]
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !Array.isArray(devices) || devices.length === 0) return;

    devices.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(item.width, item.height, item.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      const color = new Color(resolveDeviceColor({
        item,
        hoveredEntityId,
        selectedEntityId,
        heatmapMode,
        blastMode,
        blastData,
        rootCauseEntityId,
        maxBlastLevel,
      }));
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData = {
      entity_id: 'DEVICE::INSTANCED',
      type: 'device',
      parent_id: '',
      metrics: {},
      alerts: [],
      instances: devices.map((item) => item.userData),
    };
  }, [
    devices,
    dummy,
    hoveredEntityId,
    selectedEntityId,
    heatmapMode,
    blastMode,
    blastData,
    rootCauseEntityId,
    maxBlastLevel,
  ]);

  if (!Array.isArray(devices) || devices.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, devices.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
      onPointerMove={(event) => {
        event.stopPropagation();
        const index = Number(event.instanceId);
        if (!Number.isInteger(index) || index < 0 || index >= devices.length) return;
        const target = devices[index];
        if (event.object) event.object.userData = target.userData;
        if (onHover) onHover(target.userData, event);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        if (onHover) onHover(null, event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        const index = Number(event.instanceId);
        if (!Number.isInteger(index) || index < 0 || index >= devices.length) return;
        const target = devices[index];
        if (event.object) event.object.userData = target.userData;
        if (onSelect) onSelect(target.userData, event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        const index = Number(event.instanceId);
        if (!Number.isInteger(index) || index < 0 || index >= devices.length) return;
        const target = devices[index];
        if (event.object) event.object.userData = target.userData;
        if (onFocus) onFocus(target.userData, event);
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.36} metalness={0.18} emissive="#0f1724" emissiveIntensity={0.2} />
    </instancedMesh>
  );
});

