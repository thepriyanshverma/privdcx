import { memo } from 'react';

const BASE_COLOR = '#0d141d';
const SELECTED_COLOR = '#192435';
const HOVER_COLOR = '#1f2f45';

function resolveFacilityColor({ selected, hovered }) {
  if (selected) return SELECTED_COLOR;
  if (hovered) return HOVER_COLOR;
  return BASE_COLOR;
}

function handleHoverEvent(userData, event, onHover) {
  if (!onHover) return;
  onHover(userData, event);
}

export default memo(function FacilityLayer({
  facility,
  hoveredEntityId = '',
  selectedEntityId = '',
  onHover,
  onSelect,
  onFocus,
}) {
  if (!facility) return null;
  const isHovered = hoveredEntityId === facility.id;
  const isSelected = selectedEntityId === facility.id;
  const color = resolveFacilityColor({ selected: isSelected, hovered: isHovered });

  return (
    <group>
      <mesh
        receiveShadow
        position={[0, 0, 0]}
        userData={facility.userData}
        onPointerMove={(event) => {
          event.stopPropagation();
          handleHoverEvent(facility.userData, event, onHover);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          handleHoverEvent(null, event, onHover);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (onSelect) onSelect(facility.userData, event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (onFocus) onFocus(facility.userData, event);
        }}
      >
        <boxGeometry args={[facility.width, 0.16, facility.depth]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0.08} />
      </mesh>
      <gridHelper
        args={[
          Math.max(facility.width, facility.depth),
          Math.max(20, Math.round(Math.max(facility.width, facility.depth) * 0.7)),
          '#2f465f',
          '#182737',
        ]}
        position={[0, 0.1, 0]}
      />
    </group>
  );
});

