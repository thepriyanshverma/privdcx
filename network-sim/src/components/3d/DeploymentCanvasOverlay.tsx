import { useState, useRef } from 'react';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useDeploymentToolsStore } from '../../store/useDeploymentToolsStore';
import * as THREE from 'three';

export const DeploymentCanvasOverlay = () => {
  const { racks, facility } = useDataCenterStore();
  const { activeTool, isShiftPressed, setSelection, selectionSet, clearSelection } = useDeploymentToolsStore();
  
  const [boxStart, setBoxStart] = useState<THREE.Vector3 | null>(null);
  const [boxEnd, setBoxEnd] = useState<THREE.Vector3 | null>(null);
  const isDrawing = useRef(false);

  // Directly use R3F's native event intersection on the REAL floor mesh
  const handlePointerDown = (e: any) => {
    if (e.button !== 0) return;
    if (activeTool !== 'select') return;
    
    // Racks have e.stopPropagation(). If this fires, user clicked empty floor.
    try { e.target.setPointerCapture(e.pointerId); } catch(_) {}
    isDrawing.current = true;
    setBoxStart(e.point.clone());
    setBoxEnd(e.point.clone());
    if (!isShiftPressed) {
      clearSelection();
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing.current) return;
    setBoxEnd(e.point.clone());
  };

  const handlePointerUp = (e: any) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    try { e.target.releasePointerCapture(e.pointerId); } catch(_) {}
    
    if (boxStart && boxEnd) {
      const minX = Math.min(boxStart.x, boxEnd.x);
      const maxX = Math.max(boxStart.x, boxEnd.x);
      const minZ = Math.min(boxStart.z, boxEnd.z);
      const maxZ = Math.max(boxStart.z, boxEnd.z);
      
      const newSel = new Set<string>(isShiftPressed ? Array.from(selectionSet) : []);
      Object.values(racks).forEach(rack => {
        const rx = rack.position[0] * 0.6;
        const rz = rack.position[2] * 0.6;
        if (rx >= minX && rx <= maxX && rz >= minZ && rz <= maxZ) {
          newSel.add(rack.id);
        }
      });
      setSelection(Array.from(newSel));
    }
    setBoxStart(null);
    setBoxEnd(null);
  };

  return (
    <group>
      {/* Flat CAD Floor – Handles Region Select natively via its geometry */}
      {facility && facility.width && facility.length && (
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.05, 0]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          userData={{ type: 'structure' }}
        >
          <planeGeometry args={[facility.width * 2, facility.length * 2]} />
          <meshStandardMaterial color="#1e293b" roughness={1} metalness={0} />
        </mesh>
      )}

      {/* Region Select Box Preview */}
      {boxStart && boxEnd && isDrawing.current && (
         <group position={[(boxStart.x + boxEnd.x) / 2, 0.02, (boxStart.z + boxEnd.z) / 2]}>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
             <planeGeometry args={[Math.abs(boxEnd.x - boxStart.x), Math.abs(boxEnd.z - boxStart.z)]} />
             <meshBasicMaterial color="#3b82f6" transparent opacity={0.15} depthWrite={false} />
           </mesh>
           <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
             <edgesGeometry args={[new THREE.PlaneGeometry(Math.abs(boxEnd.x - boxStart.x), Math.abs(boxEnd.z - boxStart.z))]} />
             <lineBasicMaterial color="#3b82f6" />
           </lineSegments>
         </group>
      )}
    </group>
  );
};
