import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PointerLockControls } from '@react-three/drei';
import { Vector3 } from 'three';
import useTopology3DData from './useTopology3DData';
import FacilityLayer from './FacilityLayer';
import HallLayer from './HallLayer';
import RackLayer from './RackLayer';
import DeviceLayer from './DeviceLayer';

const MOVE_SPEED = 7.5;
const RUN_SPEED = 13.5;

function asText(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).trim();
}

function focusDistanceForType(type, span) {
  const normalized = asText(type, '').toLowerCase();
  if (normalized === 'facility') return Math.max(36, span * 0.68);
  if (normalized === 'hall') return 16;
  if (normalized === 'rack') return 8;
  return 5.8;
}

function CameraController({
  orbitRef,
  pointerLockRef,
  walkMode,
  focusRequest,
}) {
  const { camera } = useThree();
  const keysRef = useRef({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ShiftLeft: false,
    ShiftRight: false,
  });

  const focusTargetRef = useRef(new Vector3(0, 0, 0));
  const focusDestinationRef = useRef(new Vector3(0, 0, 0));
  const focusActiveRef = useRef(false);

  const forwardRef = useRef(new Vector3());
  const rightRef = useRef(new Vector3());
  const movementRef = useRef(new Vector3());
  const worldUpRef = useRef(new Vector3(0, 1, 0));

  useEffect(() => {
    const onKeyDown = (event) => {
      const code = asText(event.code);
      if (!Object.prototype.hasOwnProperty.call(keysRef.current, code)) return;
      keysRef.current[code] = true;
    };
    const onKeyUp = (event) => {
      const code = asText(event.code);
      if (!Object.prototype.hasOwnProperty.call(keysRef.current, code)) return;
      keysRef.current[code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!focusRequest || walkMode) return;

    const target = focusTargetRef.current;
    target.set(
      Number(focusRequest.target?.[0] || 0),
      Number(focusRequest.target?.[1] || 0),
      Number(focusRequest.target?.[2] || 0)
    );

    const anchor = orbitRef.current?.target?.clone() || new Vector3(0, 0, 0);
    const direction = camera.position.clone().sub(anchor);
    if (direction.lengthSq() < 0.001) {
      direction.set(1, 0.8, 1);
    }
    direction.normalize();

    focusDestinationRef.current.copy(target).addScaledVector(direction, Number(focusRequest.distance || 12));
    focusActiveRef.current = true;
  }, [focusRequest, walkMode, camera, orbitRef]);

  useEffect(() => {
    if (!walkMode) {
      pointerLockRef.current?.unlock?.();
      return;
    }
    camera.position.y = Math.max(1.7, Number(camera.position.y || 0));
  }, [walkMode, camera, pointerLockRef]);

  useFrame((_, delta) => {
    const orbit = orbitRef.current;

    if (walkMode) {
      const forward = forwardRef.current;
      const right = rightRef.current;
      const movement = movementRef.current;
      const worldUp = worldUpRef.current;
      const keys = keysRef.current;

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() > 0.000001) forward.normalize();
      right.crossVectors(forward, worldUp).normalize();

      movement.set(0, 0, 0);
      if (keys.KeyW) movement.add(forward);
      if (keys.KeyS) movement.sub(forward);
      if (keys.KeyA) movement.sub(right);
      if (keys.KeyD) movement.add(right);

      if (movement.lengthSq() > 0.000001) {
        const isRunning = keys.ShiftLeft || keys.ShiftRight;
        movement.normalize().multiplyScalar((isRunning ? RUN_SPEED : MOVE_SPEED) * delta);
        camera.position.add(movement);
      }

      camera.position.y = Math.max(1.6, Number(camera.position.y || 0));
      if (orbit) {
        orbit.target.set(
          camera.position.x + forward.x * 5,
          camera.position.y + forward.y * 5,
          camera.position.z + forward.z * 5
        );
      }
      return;
    }

    if (!focusActiveRef.current) return;

    const alpha = 1 - Math.exp(-delta * 6);
    camera.position.lerp(focusDestinationRef.current, alpha);

    if (orbit) {
      orbit.target.lerp(focusTargetRef.current, alpha);
      orbit.update();
    }

    const donePosition = camera.position.distanceToSquared(focusDestinationRef.current) < 0.03;
    const doneTarget = !orbit || orbit.target.distanceToSquared(focusTargetRef.current) < 0.03;
    if (donePosition && doneTarget) {
      focusActiveRef.current = false;
    }
  });

  return null;
}

function InitialCameraPose({
  orbitRef,
  span,
  walkMode,
  resetSignal,
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (walkMode) return;
    const nextY = Math.max(34, span * 0.56);
    const nextZ = Math.max(48, span * 0.76);
    camera.position.set(0, nextY, nextZ);
    if (orbitRef.current) {
      orbitRef.current.target.set(0, 0, 0);
      orbitRef.current.update();
    }
  }, [camera, orbitRef, span, walkMode, resetSignal]);

  return null;
}

export default function Topology3DScene({
  model,
  selectedEntityId = '',
  onEntitySelect,
  onEntityInspect,
  onBackgroundSelect,
  entityLiveMap = {},
  alertsByEntity = {},
  blastMode = false,
  blastData = null,
  rootCauseEntityId = '',
  heatmapMode = false,
  layerToggles = { structural: true, network: true, power: true, cooling: true },
  facilityFilter = '',
  severityFilter = '',
  entityFilter = '',
}) {
  const containerRef = useRef(null);
  const orbitRef = useRef(null);
  const pointerLockRef = useRef(null);

  const [walkMode, setWalkMode] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [cameraResetSignal, setCameraResetSignal] = useState(0);

  const hoverRafRef = useRef(0);
  const hoverDraftRef = useRef(null);

  const {
    facility,
    halls,
    racks,
    devices,
    entityIndex,
  } = useTopology3DData({
    model,
    entityLiveMap,
    alertsByEntity,
    facilityFilter,
    severityFilter,
    entityFilter,
    layerToggles,
  });

  const sceneSpan = useMemo(
    () => Math.max(80, Number(facility?.width || 80), Number(facility?.depth || 80)),
    [facility]
  );

  const queueHover = useCallback((nextValue) => {
    hoverDraftRef.current = nextValue;
    if (hoverRafRef.current) return;
    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      setHoverInfo(hoverDraftRef.current);
    });
  }, []);

  useEffect(() => () => {
    if (hoverRafRef.current) {
      window.cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = 0;
    }
  }, []);

  const resolvePointerPosition = useCallback((event) => {
    const native = event?.nativeEvent || event?.sourceEvent || event || {};
    const clientX = Number(native.clientX ?? event?.clientX);
    const clientY = Number(native.clientY ?? event?.clientY);
    const rect = containerRef.current?.getBoundingClientRect();

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !rect) {
      return { x: 20, y: 20 };
    }
    return {
      x: clientX - rect.left + 12,
      y: clientY - rect.top + 12,
    };
  }, []);

  const onHoverEntity = useCallback((userData, event) => {
    if (!userData) {
      queueHover(null);
      return;
    }
    const entityId = asText(userData.entity_id);
    if (!entityId) {
      queueHover(null);
      return;
    }

    const point = resolvePointerPosition(event);
    queueHover({
      entityId,
      name: asText(userData.display_name, entityId),
      type: asText(userData.type, 'entity'),
      x: point.x,
      y: point.y,
    });
  }, [queueHover, resolvePointerPosition]);

  const onSelectEntity = useCallback((userData) => {
    const entityId = asText(userData?.entity_id);
    if (!entityId) return;

    if (onEntityInspect) {
      onEntityInspect(entityId);
      return;
    }
    if (onEntitySelect) onEntitySelect(entityId);
  }, [onEntityInspect, onEntitySelect]);

  const onFocusEntity = useCallback((userData) => {
    const entityId = asText(userData?.entity_id);
    if (!entityId) return;
    const point = entityIndex.get(entityId);
    if (!point) return;

    setFocusRequest({
      id: entityId,
      target: [Number(point.x || 0), Number(point.y || 0), Number(point.z || 0)],
      distance: focusDistanceForType(point.type || userData?.type, sceneSpan),
    });
  }, [entityIndex, sceneSpan]);

  const onCanvasBackground = useCallback(() => {
    queueHover(null);
    if (walkMode) return;
    if (onBackgroundSelect) onBackgroundSelect();
  }, [queueHover, walkMode, onBackgroundSelect]);

  const onToggleWalkMode = useCallback(() => {
    setWalkMode((prev) => {
      const next = !prev;
      if (!next) pointerLockRef.current?.unlock?.();
      return next;
    });
    queueHover(null);
  }, [queueHover]);

  const onResetCamera = useCallback(() => {
    setWalkMode(false);
    setFocusRequest({
      id: facility?.id || 'facility',
      target: [0, 0, 0],
      distance: focusDistanceForType('facility', sceneSpan),
    });
    setCameraResetSignal((value) => value + 1);
  }, [facility, sceneSpan]);

  const hoveredEntityId = asText(hoverInfo?.entityId);

  return (
    <div ref={containerRef} className="topology-3d-shell">
      <div className="topology-3d-controls">
        <button type="button" className={walkMode ? 'primary' : ''} onClick={onToggleWalkMode}>
          Walk Mode
        </button>
        <button type="button" onClick={onResetCamera}>
          Reset Camera
        </button>
        <span>{walkMode ? 'Click scene, then use WASD + mouse' : 'Orbit: drag / pan / zoom'}</span>
      </div>

      <Canvas
        className="topology-3d-canvas"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, Math.max(34, sceneSpan * 0.56), Math.max(48, sceneSpan * 0.76)], fov: 53, near: 0.1, far: 1600 }}
        onPointerMissed={onCanvasBackground}
        onClick={() => {
          if (walkMode) pointerLockRef.current?.lock?.();
        }}
      >
        <color attach="background" args={['#0a1018']} />
        <fog attach="fog" args={['#0a1018', 160, 520]} />

        <ambientLight intensity={0.42} />
        <directionalLight
          position={[56, 120, 46]}
          intensity={1.05}
          color="#d7e6ff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={500}
          shadow-camera-left={-180}
          shadow-camera-right={180}
          shadow-camera-top={180}
          shadow-camera-bottom={-180}
        />

        <InitialCameraPose
          orbitRef={orbitRef}
          span={sceneSpan}
          walkMode={walkMode}
          resetSignal={cameraResetSignal}
        />

        <CameraController
          orbitRef={orbitRef}
          pointerLockRef={pointerLockRef}
          walkMode={walkMode}
          focusRequest={focusRequest}
        />

        <OrbitControls
          ref={orbitRef}
          enabled={!walkMode}
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={Math.max(120, sceneSpan * 2.2)}
          maxPolarAngle={Math.PI / 2.05}
        />
        <PointerLockControls ref={pointerLockRef} enabled={walkMode} />

        <FacilityLayer
          facility={facility}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          onHover={onHoverEntity}
          onSelect={onSelectEntity}
          onFocus={onFocusEntity}
        />

        <HallLayer
          halls={halls}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          blastMode={blastMode}
          blastData={blastData}
          rootCauseEntityId={rootCauseEntityId}
          onHover={onHoverEntity}
          onSelect={onSelectEntity}
          onFocus={onFocusEntity}
        />

        <RackLayer
          racks={racks}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          heatmapMode={heatmapMode}
          blastMode={blastMode}
          blastData={blastData}
          rootCauseEntityId={rootCauseEntityId}
          onHover={onHoverEntity}
          onSelect={onSelectEntity}
          onFocus={onFocusEntity}
        />

        <DeviceLayer
          devices={devices}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          heatmapMode={heatmapMode}
          blastMode={blastMode}
          blastData={blastData}
          rootCauseEntityId={rootCauseEntityId}
          onHover={onHoverEntity}
          onSelect={onSelectEntity}
          onFocus={onFocusEntity}
        />
      </Canvas>

      {hoverInfo && (
        <div
          className="topology-3d-tooltip"
          style={{
            left: `${hoverInfo.x}px`,
            top: `${hoverInfo.y}px`,
          }}
        >
          <div className="topology-3d-tooltip-title">{hoverInfo.name}</div>
          <div className="topology-3d-tooltip-type">{hoverInfo.type}</div>
        </div>
      )}
    </div>
  );
}
