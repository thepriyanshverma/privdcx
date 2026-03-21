import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useTenantStore } from '../../store/useTenantStore';
import { useDataCenterStore } from '../../store/useDataCenterStore';

const TYPE_ICONS: Record<string, string> = {
  operator: '🏭',
  cloud: '☁️',
  enterprise: '🏢',
  team: '👥',
};

export const TenantCanvasOverlay = () => {
  const { tenants, physicalAllocations, activeTenantFilter } = useTenantStore();
  const { zones, racks } = useDataCenterStore();

  // ── Zone Tenant Allocations ────────────────────────────────────────────────
  const zoneAllocations = useMemo(() =>
    physicalAllocations
      .filter(a => a.resourceType === 'zone')
      .map(a => ({
        alloc: a,
        tenant: tenants[a.tenantId],
        zone: zones.find(z => z.id === a.resourceId)
      }))
      .filter(({ tenant, zone }) => tenant && zone)
      .filter(({ alloc }) => !activeTenantFilter || alloc.tenantId === activeTenantFilter),
    [physicalAllocations, tenants, zones, activeTenantFilter]
  );

  // ── Rack-Level Allocations (direct only, not inherited) ───────────────────
  const rackAllocations = useMemo(() =>
    physicalAllocations
      .filter(a => a.resourceType === 'rack')
      .map(a => ({
        alloc: a,
        tenant: tenants[a.tenantId],
        rack: racks[a.resourceId]
      }))
      .filter(({ tenant, rack }) => tenant && rack)
      .filter(({ alloc }) => !activeTenantFilter || alloc.tenantId === activeTenantFilter),
    [physicalAllocations, tenants, racks, activeTenantFilter]
  );

  return (
    <group>
      {/* ── Zone Floor Tints ──────────────────────────────────────────────── */}
      {zoneAllocations.map(({ alloc, tenant, zone }) => {
        if (!zone) return null;
        const cx = (zone.boundary.minX + zone.boundary.maxX) / 2;
        const cz = (zone.boundary.minZ + zone.boundary.maxZ) / 2;
        const w = zone.boundary.maxX - zone.boundary.minX;
        const d = zone.boundary.maxZ - zone.boundary.minZ;
        const color = new THREE.Color(tenant!.color);

        return (
          <group key={alloc.id}>
            {/* Floor fill */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]}>
              <planeGeometry args={[w, d]} />
              <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
            </mesh>

            {/* Border outline */}
            <lineSegments position={[cx, 0.01, cz]}>
              <edgesGeometry args={[new THREE.BoxGeometry(w, 0.01, d)]} />
              <lineBasicMaterial color={color} transparent opacity={0.5} />
            </lineSegments>

            {/* Tenant label */}
            <Html
              position={[zone.boundary.minX + 0.5, 0.08, zone.boundary.minZ + 0.5]}
              distanceFactor={30}
              occlude
            >
              <div
                className="px-2 py-1 rounded-lg border backdrop-blur text-[9px] font-bold uppercase tracking-tight select-none pointer-events-none"
                style={{
                  backgroundColor: `${tenant!.color}22`,
                  borderColor: `${tenant!.color}66`,
                  color: tenant!.color,
                }}
              >
                <div className="flex items-center gap-1">
                  <span>{TYPE_ICONS[tenant!.type] ?? '🏭'}</span>
                  <span>{tenant!.name}</span>
                </div>
                {alloc.leaseLabel && (
                  <div className="text-[8px] opacity-70 mt-0.5">{alloc.leaseLabel}</div>
                )}
                {alloc.powerQuotaW > 0 && (
                  <div className="text-[8px] opacity-60">
                    Quota: {(alloc.powerQuotaW / 1000).toFixed(0)}kW
                  </div>
                )}
              </div>
            </Html>
          </group>
        );
      })}

    </group>
  );
};
