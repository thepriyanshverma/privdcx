import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls, Grid, Text, Html } from '@react-three/drei';
import { useDataCenterStore, type Rack } from '../../store/useDataCenterStore';
import { useClusterStore } from '../../store/useClusterStore';
import { useInfraHealthStore } from '../../store/useInfraHealthStore';
import { useTenantStore } from '../../store/useTenantStore';
import { controlPlane } from '../../infra-core/control-plane/infraManager';
import { Cuboid, Layers, X, GripHorizontal } from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { DeploymentCanvasOverlay } from './DeploymentCanvasOverlay';
import { TenantCanvasOverlay } from './TenantCanvasOverlay';
import { useDeploymentToolsStore } from '../../store/useDeploymentToolsStore';

// ─── Camera Controller (Dynamic Frustum) ──────────────────────────────────────
const CameraController = ({ facility }: { facility: any }) => {
  const { camera } = useThree();

  useEffect(() => {
    if (camera && camera.type === 'OrthographicCamera' && facility) {
      const orthoCam = camera as THREE.OrthographicCamera;
      orthoCam.position.set(20, 20, 20);
      orthoCam.lookAt(0, 0, 0);
      
      const maxDim = Math.max(facility.width, facility.length);
      const targetZoom = Math.min(Math.max(500 / maxDim, 5), 120); 
      orthoCam.zoom = targetZoom;
      orthoCam.near = 0.1;
      orthoCam.far = 10000;
      orthoCam.updateProjectionMatrix();
    }
  }, [camera, facility]);

  return null;
};

// ─── Thermal Heatmap Layer ───────────────────────────────────────────────────
const ThermalHeatmapOverlay = ({ facility, racks }: { facility: any, racks: Record<string, Rack> }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const width = 256;
    const height = 256;
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(0, 0, width, height);

    const scaleX = width / facility.width;
    const scaleY = height / facility.length;

    Object.values(racks).forEach(rack => {
      const coreState = controlPlane.getRackState(rack.id);
      const rHeat = coreState?.totalThermalBTU || 0;
      if (rHeat > 0) {
        const cx = (rack.position[0] * 0.6 + facility.width / 2) * scaleX;
        const cy = (rack.position[2] * 0.6 + facility.length / 2) * scaleY;
        const radius = 2.5 * Math.max(scaleX, scaleY);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        const heatRatio = Math.min(rHeat / 40000, 1.0);
        let centerColor = 'rgba(239, 68, 68, 0.7)';
        if (heatRatio < 0.3) centerColor = 'rgba(56, 189, 248, 0.1)';
        else if (heatRatio < 0.6) centerColor = 'rgba(250, 204, 21, 0.3)';
        gradient.addColorStop(0, centerColor);
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (textureRef.current) textureRef.current.needsUpdate = true;
  }, [racks, facility]);

  return (
    <group position={[0, -0.045, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[facility.width, facility.length]} />
        <meshBasicMaterial transparent opacity={0.6} depthWrite={false}>
          {textureRef.current && <primitive object={textureRef.current} attach="map" />}
        </meshBasicMaterial>
      </mesh>
      <Html style={{ display: 'none' }}><canvas ref={canvasRef} /></Html>
    </group>
  );
};

// ─── Health Risk Layer ───────────────────────────────────────────────────────
const HealthRiskOverlay = ({ facility, racks }: { facility: any, racks: Record<string, Rack> }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const telemetry = useInfraHealthStore(s => s.rackTelemetry);

  useEffect(() => {
    if (!canvasRef.current || !facility) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const width = 256;
    const height = 256;
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, width, height);

    const scaleX = width / facility.width;
    const scaleY = height / facility.length;

    Object.values(racks).forEach(rack => {
      const tel = telemetry[rack.id];
      if (!tel || tel.anomalyProbability < 5) return;
      const cx = (rack.position[0] * 0.6 + facility.width / 2) * scaleX;
      const cy = (rack.position[2] * 0.6 + facility.length / 2) * scaleY;
      const radius = Math.max(2.5, (tel.anomalyProbability / 20)) * Math.max(scaleX, scaleY);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      let centerColor = tel.anomalyProbability > 50 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(234, 179, 8, 0.4)';
      gradient.addColorStop(0, centerColor);
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    if (textureRef.current) textureRef.current.needsUpdate = true;
  }, [racks, facility, telemetry]);

  return (
    <group position={[0, -0.044, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[facility.width, facility.length]} />
        <meshBasicMaterial transparent opacity={0.65} depthWrite={false}>
          {textureRef.current && <primitive object={textureRef.current} attach="map" />}
        </meshBasicMaterial>
      </mesh>
      <Html style={{ display: 'none' }}><canvas ref={canvasRef} /></Html>
    </group>
  );
};

// ─── Tenant Stripe Layer ────────────────────────────────────────────────────
const TenantStripeLayer = ({ racks, lod }: { racks: Record<string, Rack>, lod: string }) => {
  const { physicalAllocations, tenants } = useTenantStore();
  if (lod === 'far') return null;
  return (
    <>
      {Object.values(racks).map(rack => {
        const alloc = physicalAllocations.find(a => a.resourceType === 'rack' && a.resourceId === rack.id);
        if (!alloc) return null;
        const tenant = tenants[alloc.tenantId];
        if (!tenant) return null;
        return (
          <mesh key={rack.id} position={[rack.position[0] * 0.6, rack.position[1] + 1.03, rack.position[2] * 0.6]}>
            <boxGeometry args={[1.2, 0.06, 0.6]} />
            <meshBasicMaterial color={tenant.color} transparent opacity={0.85} />
          </mesh>
        );
      })}
    </>
  );
};

// ─── Cluster Group Outline Layer ────────────────────────────────────────────
const ClusterGroupLayer = ({ racks, lod }: { racks: Record<string, Rack>, lod: string }) => {
  const clusters = useClusterStore(s => s.clusters);
  const { semanticFilter } = useDeploymentToolsStore();
  if (lod === 'far') return null;

  return (
    <>
      {Object.values(clusters).map(cluster => {
        if (!cluster.assignedRacks.length) return null;
        const clusterRacks = cluster.assignedRacks.map(a => racks[a.rackId]).filter(Boolean);
        if (!clusterRacks.length) return null;
        const xs = clusterRacks.map(r => r.position[0] * 0.6);
        const zs = clusterRacks.map(r => r.position[2] * 0.6);
        const minX = Math.min(...xs) - 0.5;
        const maxX = Math.max(...xs) + 0.5;
        const minZ = Math.min(...zs) - 0.8;
        const maxZ = Math.max(...zs) + 0.8;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const w = maxX - minX;
        const d = maxZ - minZ;
        const isActive = semanticFilter.type === 'cluster' && semanticFilter.id === cluster.id;
        return (
          <group key={cluster.id}>
            <mesh position={[cx, 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w, d]} />
              <meshBasicMaterial color={cluster.color} transparent opacity={isActive ? 0.18 : 0.06} depthWrite={false} />
            </mesh>
            <lineSegments position={[cx, 0.03, cz]}>
              <edgesGeometry args={[new THREE.BoxGeometry(w, 0.01, d)]} />
              <lineBasicMaterial color={cluster.color} transparent opacity={isActive ? 0.9 : 0.35} />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
};

const LODManager = ({ lod, setLod, onCameraUpdate }: { lod: 'close' | 'mid' | 'far', setLod: (l: 'close' | 'mid' | 'far') => void, onCameraUpdate?: (state: any) => void }) => {
  useFrame((state) => {
    const dist = state.camera.position.length();
    if (dist > 180) {
      if (lod !== 'far') setLod('far');
    } else if (dist > 50) {
      if (lod !== 'mid') setLod('mid');
    } else {
      if (lod !== 'close') setLod('close');
    }
    onCameraUpdate?.(state);
  });
  return null;
};

const InstancedRacks = ({ racks, selectionSet, lod, topDownVisible }: { racks: Record<string, Rack>, selectionSet: Set<string>, lod: 'close' | 'mid' | 'far', topDownVisible: boolean }) => {
  // refs for panels
  const backPanelRef = useRef<THREE.InstancedMesh>(null);
  const leftPanelRef = useRef<THREE.InstancedMesh>(null);
  const rightPanelRef = useRef<THREE.InstancedMesh>(null);
  const roofPanelRef = useRef<THREE.InstancedMesh>(null);
  const bottomPanelRef = useRef<THREE.InstancedMesh>(null);
  
  // single equipment mesh with advanced shader
  const equipmentMeshRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const clusters = useClusterStore(s => s.clusters);
  const telemetry = useInfraHealthStore(s => s.rackTelemetry);
  const { semanticFilter, hoveredRackId } = useDeploymentToolsStore();
  const rackArray = useMemo(() => Object.values(racks).sort((a, b) => a.id.localeCompare(b.id)), [racks]);
  const rackCount = rackArray.length;
  const slotCount = rackCount * 42;

  useFrame((state) => {
    if (equipmentMeshRef.current?.material) {
      (equipmentMeshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
      (equipmentMeshRef.current.material as THREE.ShaderMaterial).uniforms.uLOD.value = lod === 'far' ? 0 : lod === 'mid' ? 1 : 2;
    }
  });

  // Interaction Handlers (Pure R3F Event Bubbling)
  const handlePointerDown = useCallback((e: any) => {
    if (e.button !== 0 && e.button !== 2) return; // Only process left/right clicks
    if (e.instanceId === undefined) return;
    e.stopPropagation();

    let idx = e.instanceId;
    if (e.object.userData?.type === 'rack-equipment') {
      idx = Math.floor(idx / 42);
    }
    const rackId = rackArray[idx]?.id;
    if (!rackId) return;

    const { activeTool, setSelection } = useDeploymentToolsStore.getState();
    if (activeTool === 'select' || activeTool === 'navigate') {
       if (e.shiftKey) {
         const newSel = new Set(selectionSet);
         if (newSel.has(rackId)) newSel.delete(rackId);
         else newSel.add(rackId);
         setSelection(Array.from(newSel));
       } else {
         setSelection([rackId]);
       }
    }
  }, [rackArray, selectionSet]);

  const handlePointerMove = useCallback((e: any) => {
    if (e.instanceId === undefined) return;
    e.stopPropagation();

    let idx = e.instanceId;
    if (e.object.userData?.type === 'rack-equipment') {
      idx = Math.floor(idx / 42);
    }
    const rackId = rackArray[idx]?.id;
    const { activeTool, setHoveredRackId, hoveredRackId } = useDeploymentToolsStore.getState();
    
    if (rackId && hoveredRackId !== rackId) {
      if (activeTool === 'select' || activeTool === 'navigate') {
         setHoveredRackId(rackId);
      }
    }
  }, [rackArray]);

  const handlePointerOut = useCallback(() => {
    useDeploymentToolsStore.getState().setHoveredRackId(null);
  }, []);

  useLayoutEffect(() => {
    if (!backPanelRef.current) return;
    
    const colorSelected = new THREE.Color('#3b82f6');
    const colorMultiSelected = new THREE.Color('#00f3ff');
    const patternAttr = new Float32Array(slotCount).fill(4.0);
    const activityAttr = new Float32Array(slotCount).fill(0.0);
    const densityAttr = new Float32Array(slotCount).fill(0.0);
    const emissiveAttr = new Float32Array(slotCount).fill(1.5);
    const hoverAttr = new Float32Array(slotCount).fill(0.0);

    const isCutaway = lod === 'close';

    rackArray.forEach((rack, i) => {
      const isSelected = selectionSet.has(rack.id);
      const isRackHovered = hoveredRackId === rack.id;
      
      // Density Extrusion: Depth scales with hardware count
      const loadFactor = rack.equipment.length / 20.0; // Assume 20 is "dense"
      const baseDepth = 1.16;
      const currentDepth = baseDepth * (1.0 + Math.min(loadFactor * 0.4, 0.4));
      
      dummy.position.set(rack.position[0] * 0.6, rack.position[1], rack.position[2] * 0.6);
      dummy.rotation.set(...rack.rotation);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      // Back Panel
      dummy.position.set(rack.position[0] * 0.6, rack.position[1], rack.position[2] * 0.6 - currentDepth/2);
      dummy.scale.set(0.6, 2, 0.02);
      dummy.updateMatrix();
      backPanelRef.current!.setMatrixAt(i, dummy.matrix);

      // Left Panel (Hide in Close LOD for cutaway)
      dummy.position.set(rack.position[0] * 0.6 - 0.3, rack.position[1], rack.position[2] * 0.6);
      dummy.scale.set(0.02, 2, currentDepth);
      dummy.updateMatrix();
      leftPanelRef.current!.setMatrixAt(i, dummy.matrix);
      leftPanelRef.current!.visible = !isCutaway;

      // Right Panel
      dummy.position.set(rack.position[0] * 0.6 + 0.3, rack.position[1], rack.position[2] * 0.6);
      dummy.scale.set(0.02, 2, currentDepth);
      dummy.updateMatrix();
      rightPanelRef.current!.setMatrixAt(i, dummy.matrix);

      // Roof Panel (Hide in Close LOD or Top View)
      dummy.position.set(rack.position[0] * 0.6, rack.position[1] + 1.0, rack.position[2] * 0.6);
      dummy.scale.set(0.6, 0.02, currentDepth);
      dummy.updateMatrix();
      roofPanelRef.current!.setMatrixAt(i, dummy.matrix);
      roofPanelRef.current!.visible = !isCutaway && topDownVisible;

      // Bottom Panel
      dummy.position.set(rack.position[0] * 0.6, rack.position[1] - 1.0, rack.position[2] * 0.6);
      dummy.scale.set(0.6, 0.02, currentDepth);
      dummy.updateMatrix();
      bottomPanelRef.current!.setMatrixAt(i, dummy.matrix);

      let rackColor: THREE.Color;
      if (isSelected) {
        rackColor = selectionSet.size > 1 ? colorMultiSelected : colorSelected;
      } else {
        // Analytical mode: light grey CAD palette
        let base = '#B8C2D1';
        if (rack.templateType === 'network') base = '#a8b8d0';
        if (rack.templateType === 'storage') base = '#c0cad8';
        if (rack.templateType === 'ai-cluster') base = '#9aacbf';
        rackColor = new THREE.Color(base);
        if (isRackHovered) rackColor.lerp(new THREE.Color('#3b82f6'), 0.35);
      }

      let isMuted = false;
      if (semanticFilter.type === 'cluster' && semanticFilter.id) {
        const cluster = clusters[semanticFilter.id];
        if (!cluster || !cluster.assignedRacks.find(a => a.rackId === rack.id)) isMuted = true;
      } else if (semanticFilter.type === 'tenant' && semanticFilter.id) {
        const { physicalAllocations } = useTenantStore.getState();
        const alloc = physicalAllocations.find(a => a.resourceType === 'rack' && a.resourceId === rack.id);
        if (!alloc || alloc.tenantId !== semanticFilter.id) isMuted = true;
      }
      if (isMuted && !isSelected) rackColor.lerp(new THREE.Color('#0f172a'), 0.85);

      [backPanelRef, leftPanelRef, rightPanelRef, roofPanelRef, bottomPanelRef].forEach(ref => {
        if (ref.current) ref.current.setColorAt(i, rackColor);
      });

      // Equipment Slots
      const RACK_USABLE_HEIGHT = 1.95;
      const uHeight = RACK_USABLE_HEIGHT / 42.0;
      const RACK_BOTTOM_Y = rack.position[1] - (RACK_USABLE_HEIGHT / 2.0);
      
      const rackSlots = new Array(42).fill(null).map(() => ({ type: 'empty', uSize: 1 }));
      rack.equipment.forEach(eq => {
        const startU = eq.slotPosition || 0;
        for (let s = 0; s < eq.uSize; s++) {
          if (startU + s < 42) rackSlots[startU + s] = { type: eq.type, uSize: eq.uSize, isBase: s === 0 } as any;
        }
      });

      rackSlots.forEach((slot, uIdx) => {
        const globalEqIdx = i * 42 + uIdx;
        const eqCenterY = RACK_BOTTOM_Y + uIdx * uHeight + uHeight / 2.0;
        
        // Default: Empty Slot (Hollow Frame)
        let patternType = 4.0; 
        let depth = currentDepth * 0.9;
        let density = 0.05;
        let offsetZ = 0;
        let scaleX = 0.95;
        let scaleY = 0.9;

        if (slot.type !== 'empty') {
          density = 1.0;
          if (slot.type === 'server') { 
            patternType = 0; depth = currentDepth * 0.7; density = 0.8; 
            scaleY = 0.95; // Thin slab
          }
          else if (slot.type === 'storage') { 
            patternType = 1; depth = currentDepth * 0.95; density = 1.2; 
            scaleY = 0.98; // Deep box
          }
          else if (slot.type === 'switch') { 
            patternType = 2; depth = currentDepth * 0.3; offsetZ = currentDepth * 0.2; 
            scaleY = 0.95; // Flat plate
          }
          else if (slot.type === 'pdu') { 
            patternType = 3; depth = currentDepth * 0.1; offsetZ = -currentDepth * 0.4; 
            scaleX = 0.1;
          }
        }

        if (equipmentMeshRef.current) {
          dummy.position.set(rack.position[0] * 0.6, eqCenterY, rack.position[2] * 0.6 + offsetZ);
          dummy.rotation.set(...rack.rotation);
          dummy.scale.set(0.58 * scaleX, uHeight * scaleY, depth);
          dummy.updateMatrix();
          equipmentMeshRef.current.setMatrixAt(globalEqIdx, dummy.matrix);
        }
        
        patternAttr[globalEqIdx] = patternType;
        const tel = telemetry[rack.id];
        let activityState = slot.type === 'empty' ? 0.0 : 1.0;
        if (tel && slot.type !== 'empty' && tel.anomalyProbability > 80) activityState = 3.0;
        if (isMuted) activityState = 4.0;
        
        activityAttr[globalEqIdx] = activityState;
        densityAttr[globalEqIdx] = density;
        emissiveAttr[globalEqIdx] = isSelected ? 3.0 : 1.5;
        hoverAttr[globalEqIdx] = isRackHovered ? 1.0 : 0.0;
      });
    });

    [backPanelRef, leftPanelRef, rightPanelRef, roofPanelRef, bottomPanelRef].forEach(ref => {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      }
    });

    if (equipmentMeshRef.current) {
      equipmentMeshRef.current.instanceMatrix.needsUpdate = true;
      const geo = equipmentMeshRef.current.geometry;
      geo.setAttribute('instPatternType', new THREE.InstancedBufferAttribute(patternAttr, 1));
      geo.setAttribute('instActivityState', new THREE.InstancedBufferAttribute(activityAttr, 1));
      geo.setAttribute('instDensity', new THREE.InstancedBufferAttribute(densityAttr, 1));
      geo.setAttribute('instEmissiveIntensity', new THREE.InstancedBufferAttribute(emissiveAttr, 1));
      geo.setAttribute('instHovered', new THREE.InstancedBufferAttribute(hoverAttr, 1));
      geo.attributes.instPatternType.needsUpdate = true;
      geo.attributes.instActivityState.needsUpdate = true;
      geo.attributes.instDensity.needsUpdate = true;
      geo.attributes.instEmissiveIntensity.needsUpdate = true;
      geo.attributes.instHovered.needsUpdate = true;
    }
  }, [rackArray, selectionSet, clusters, telemetry, lod, semanticFilter, hoveredRackId, slotCount, topDownVisible]);

  if (rackCount === 0) return null;
  return (
    <group 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      {/* Structural Panels – Analytical Matte, vertexColors for per-rack tinting */}
      <instancedMesh ref={backPanelRef} name="rack-frame" userData={{ type: 'rack-frame' }} args={[undefined, undefined, rackCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
      </instancedMesh>
      <instancedMesh ref={leftPanelRef} name="rack-frame" userData={{ type: 'rack-frame' }} args={[undefined, undefined, rackCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
      </instancedMesh>
      <instancedMesh ref={rightPanelRef} name="rack-frame" userData={{ type: 'rack-frame' }} args={[undefined, undefined, rackCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
      </instancedMesh>
      <instancedMesh ref={roofPanelRef} name="rack-frame" userData={{ type: 'rack-frame' }} args={[undefined, undefined, rackCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
      </instancedMesh>
      <instancedMesh ref={bottomPanelRef} name="rack-frame" userData={{ type: 'rack-frame' }} args={[undefined, undefined, rackCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
      </instancedMesh>

      {/* Internal Slots */}
      {lod !== 'far' && (
        <instancedMesh ref={equipmentMeshRef} args={[undefined, undefined, slotCount]} frustumCulled={false} name="rack-equipment" userData={{ type: 'rack-equipment' }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.9} metalness={0.05} vertexColors />
        </instancedMesh>
      )}
    </group>
  );
};


const Wall = ({ position, args, rotation }: any) => (
  <mesh position={position} rotation={rotation} name="structure" userData={{ type: 'structure' }}>
    <planeGeometry args={args} />
    <meshBasicMaterial color="#0B0F14" />
  </mesh>
);

const AisleMarking = ({ aisle }: { aisle: any }) => {
  return (
    <group position={aisle.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={aisle.size} />
        <meshBasicMaterial color={aisle.type === 'hot' ? "#ef4444" : "#3b82f6"} transparent opacity={0.10} depthWrite={false} />
      </mesh>
    </group>
  );
};

const StructuralColumns = ({ width, length, height }: { width: number, length: number, height: number }) => {
  const columns = [];
  const spacing = 8;
  for (let x = -width / 2 + spacing; x < width / 2; x += spacing) {
    for (let z = -length / 2 + spacing; z < length / 2; z += spacing) {
      columns.push(
        <mesh key={`${x}-${z}`} position={[x, height / 2, z]} name="structure" userData={{ type: 'structure' }}>
          <boxGeometry args={[0.6, height, 0.6]} />
          <meshBasicMaterial color="#475569" />
        </mesh>
      );
    }
  }
  return <>{columns}</>;
};

export type SpatialOverlayMode = 'none' | 'heatmap' | 'health';

export const DataCenterCanvas = ({ spatialOverlay }: { spatialOverlay: SpatialOverlayMode }) => {
  const { racks, facility, aisles, layoutVersion } = useDataCenterStore();
  const [lod, setLod] = useState<'close' | 'mid' | 'far'>('far');
  const [topDownVisible, setTopDownVisible] = useState(true);
  const wallHeight = 4;
  
  if (!facility || !facility.width || !facility.length) return <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-slate-500 font-mono">Loading Facility Context...</div>;
  
  const { activeTool, hoveredRackId, selectionSet, isDrawing, isDragging } = useDeploymentToolsStore();
  const hoveredRackObj = hoveredRackId ? racks[hoveredRackId] : null;
  

  const handleCameraUpdate = (state: any) => {
    const dir = new THREE.Vector3();
    state.camera.getWorldDirection(dir);
    const downDot = dir.dot(new THREE.Vector3(0, -1, 0));
    // If looking down > 58 deg from horizontal
    const isTopDown = downDot > 0.85; 
    if (isTopDown !== !topDownVisible) {
      setTopDownVisible(!isTopDown);
    }
  };

  return (
    <div className="absolute inset-0 bg-[#1a2333]">
      <Canvas gl={{ antialias: true }}>
        <CameraController facility={facility} />
        <LODManager lod={lod} setLod={setLod} onCameraUpdate={handleCameraUpdate} />
        <OrthographicCamera 
          makeDefault 
          position={[20, 20, 20]} 
          zoom={18} 
          near={0.1} 
          far={10000} 
        />
        <color attach="background" args={['#1a2333']} />

        {/* Analytical Flat Lighting – 1 ambient + 1 directional only */}
        <ambientLight intensity={0.85} color="#e2e8f0" />
        <directionalLight position={[10, 30, 10]} intensity={0.35} color="#ffffff" />

        <OrbitControls
          makeDefault
          enabled={!isDrawing && !isDragging}
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          panSpeed={1.2}
          rotateSpeed={0.6}
          zoomSpeed={0.8}
          minZoom={5}
          maxZoom={120}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minPolarAngle={0}
          enableDamping
          dampingFactor={0.06}
          screenSpacePanning={true}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <DeploymentCanvasOverlay />
        <Wall position={[0, wallHeight / 2, -facility.length / 2]} args={[facility.width, wallHeight]} />
        <Wall position={[0, wallHeight / 2, facility.length / 2]} args={[facility.width, wallHeight]} rotation={[0, Math.PI, 0]} />
        <Wall position={[-facility.width / 2, wallHeight / 2, 0]} args={[facility.length, wallHeight]} rotation={[0, Math.PI / 2, 0]} />
        <Wall position={[facility.width / 2, wallHeight / 2, 0]} args={[facility.length, wallHeight]} rotation={[0, -Math.PI / 2, 0]} />
        <StructuralColumns width={facility.width} length={facility.length} height={wallHeight} />
        {/* Floor renders implicitly via DeploymentCanvasOverlay to natively capture Region Selection */}
        {spatialOverlay === 'heatmap' && <ThermalHeatmapOverlay facility={facility} racks={racks} />}
        {spatialOverlay === 'health' && <HealthRiskOverlay facility={facility} racks={racks} />}
        {aisles.map(a => <AisleMarking key={a.id} aisle={a} />)}
        <Text position={[0, -0.04, facility.length / 2 + 1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.5} color="#64748b" anchorX="center" anchorY="middle">Width: {facility.width}m</Text>
        <Text position={[facility.width / 2 + 1, -0.04, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} fontSize={1.5} color="#64748b" anchorX="center" anchorY="middle">Length: {facility.length}m</Text>
        <Grid infiniteGrid fadeDistance={50} sectionColor="#94a3b8" cellColor="#475569" cellSize={0.6} sectionSize={3} position={[0, 0.01, 0]} />
        <InstancedRacks key={`racks-layer-${layoutVersion}`} racks={racks} selectionSet={selectionSet} lod={lod} topDownVisible={topDownVisible} />
        <TenantStripeLayer racks={racks} lod={lod} />
        <ClusterGroupLayer racks={racks} lod={lod} />
        {Array.from(selectionSet).map(id => {
          const rack = racks[id];
          if (!rack) return null;
          return (
            <group key={`hl-${id}`} position={[rack.position[0] * 0.6, rack.position[1], rack.position[2] * 0.6]}>
              <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(0.62, 2.01, 1.25)]} /><lineBasicMaterial color="#3b82f6" linewidth={2} /></lineSegments>
              <mesh><boxGeometry args={[0.65, 2.08, 1.3]} /><meshBasicMaterial color="#3b82f6" transparent opacity={0.12} depthWrite={false} /></mesh>
            </group>
          );
        })}
        {hoveredRackObj && lod !== 'far' && !activeTool.includes('drag') && (() => {
          return (
            <group position={[hoveredRackObj.position[0] * 0.6, hoveredRackObj.position[1], hoveredRackObj.position[2] * 0.6]}>
              <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(0.61, 2.02, 1.25)]} /><lineBasicMaterial color="#00f3ff" linewidth={1} transparent opacity={0.5} /></lineSegments>
            </group>
          );
        })()}
        <TenantCanvasOverlay />
      </Canvas>
      <SemanticFilterPanel racks={racks} />
    </div>
  );
};

const NAV_HEIGHT = 56;
function useDraggablePanel(initialRight = 16, initialTop = NAV_HEIGHT + 8) {
  const [pos, setPos] = useState({ x: initialRight, y: initialTop });
  const [zIndex, setZIndex] = useState(200);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const bringToFront = useCallback(() => setZIndex(z => z < 300 ? 300 : z), []);
  const onGripMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    bringToFront();
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newY = Math.max(NAV_HEIGHT + 4, ev.clientY - offset.current.y);
      const newX = Math.max(4, Math.min(window.innerWidth - (panelRef.current?.offsetWidth ?? 280) - 4, ev.clientX - offset.current.x));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [bringToFront]);
  const style: React.CSSProperties = { position: 'fixed', left: pos.x, top: pos.y, zIndex, maxHeight: `calc(100vh - ${pos.y + 8}px)`, overflowY: 'auto', width: 280 };
  return { panelRef, style, onGripMouseDown, bringToFront };
}

const SemanticFilterPanel = ({ racks }: { racks: Record<string, Rack> }) => {
  const { semanticFilter, setSemanticFilter } = useDeploymentToolsStore();
  const clusters = useClusterStore(s => s.clusters);
  const { tenants, physicalAllocations } = useTenantStore();
  const [open, setOpen] = useState(false);
  const { panelRef, style, onGripMouseDown, bringToFront } = useDraggablePanel(window.innerWidth - 296, NAV_HEIGHT + 8);
  const activeTenants = useMemo(() => {
    const tIds = new Set(physicalAllocations.filter(a => a.resourceType === 'rack' && racks[a.resourceId]).map(a => a.tenantId));
    return Object.values(tenants).filter(t => tIds.has(t.id));
  }, [tenants, physicalAllocations, racks]);
  const activeClusterList = useMemo(() => Object.values(clusters).filter(c => c.assignedRacks.some(a => racks[a.rackId])), [clusters, racks]);
  const clearFilter = () => setSemanticFilter(null, null);

  return (
    <div ref={panelRef} style={style} onMouseDown={bringToFront} className="pointer-events-auto flex flex-col gap-2">
      <div className="bg-slate-900/98 border border-slate-700 rounded-xl backdrop-blur shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 cursor-grab active:cursor-grabbing select-none" onMouseDown={onGripMouseDown}>
          <GripHorizontal className="w-3.5 h-3.5 text-slate-600" /><h2 className="text-slate-200 font-semibold font-mono flex items-center gap-2 text-sm flex-1"><Cuboid className="w-3.5 h-3.5 text-emerald-500" />Infra Twin</h2>
          <button onClick={() => setOpen(o => !o)} className={`p-1.5 rounded-lg border transition-colors ${open || semanticFilter.type ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Layers className="w-3.5 h-3.5" /></button>
        </div>
        <div className="px-4 py-3"><ul className="text-xs text-slate-400 space-y-1 font-sans"><li>• <span className="text-slate-200 font-medium">Pan:</span> Right Click</li><li>• <span className="text-slate-200 font-medium">Rotate:</span> Middle Mouse</li><li>• <span className="text-slate-200 font-medium">Zoom:</span> Scroll</li><li>• <span className="text-slate-200 font-medium">Select:</span> Left Click / Drag</li></ul></div>
      </div>
      {open && (
        <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-3 backdrop-blur shadow-2xl flex flex-col gap-3">
          {semanticFilter.type && (<div className="flex items-center justify-between bg-emerald-900/30 border border-emerald-600/40 rounded-lg px-3 py-1.5"><span className="text-xs text-emerald-400 font-mono">Isolating: <span className="font-bold capitalize">{semanticFilter.type}</span></span><button onClick={clearFilter} className="text-slate-400 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button></div>)}
          {activeClusterList.length > 0 && (<div><div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-2">Clusters</div><div className="flex flex-col gap-1">{activeClusterList.map(cluster => { const isActive = semanticFilter.type === 'cluster' && semanticFilter.id === cluster.id; return (<button key={cluster.id} onClick={() => isActive ? clearFilter() : setSemanticFilter('cluster', cluster.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-all ${isActive ? 'bg-slate-700/80 ring-1' : 'hover:bg-slate-800'}`} style={isActive ? { outline: `2px solid ${cluster.color}`, outlineOffset: '1px' } : {}}><div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cluster.color }} /><span className="text-slate-200 truncate">{cluster.name}</span><span className="ml-auto text-slate-500 text-[9px]">{cluster.assignedRacks.length}R</span></button>); })}</div></div>)}
          {activeTenants.length > 0 && (<div><div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest mb-2">Tenants</div><div className="flex flex-col gap-1">{activeTenants.map(tenant => { const isActive = semanticFilter.type === 'tenant' && semanticFilter.id === tenant.id; const rackCount_ = physicalAllocations.filter(a => a.tenantId === tenant.id && a.resourceType === 'rack' && racks[a.resourceId]).length; return (<button key={tenant.id} onClick={() => isActive ? clearFilter() : setSemanticFilter('tenant', tenant.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-all ${isActive ? 'bg-slate-700/80 ring-1 ring-white/10' : 'hover:bg-slate-800'}`}><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tenant.color }} /><span className="text-slate-200 truncate">{tenant.name}</span><span className="ml-auto text-slate-500 text-[9px]">{rackCount_}R</span></button>); })}</div></div>)}
          {activeClusterList.length === 0 && activeTenants.length === 0 && (<p className="text-xs text-slate-500 text-center py-2">No clusters or tenants assigned yet.</p>)}
        </div>
      )}
    </div>
  );
};
