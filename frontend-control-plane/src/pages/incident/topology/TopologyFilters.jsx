import { useState } from 'react';

export default function TopologyFilters({
  filters,
  selectedEntityId = '',
  entityInputValue = '',
  onEntityInputChange,
  onEntityInputCommit,
  onFilterChange,
  activeView,
  onViewChange,
  focusMode = false,
  onToggleFocusMode,
  blastMode = false,
  onToggleBlastMode,
  pathMode = false,
  onTogglePathMode = () => {},
  onClearPathMode = () => {},
  heatmapMode = false,
  onToggleHeatmapMode = () => {},
  propagationMode = true,
  onTogglePropagationMode = () => {},
  onAutoDetectRootCause = () => {},
  layerToggles = { structural: true, network: true, power: true, cooling: true },
  onToggleLayer = () => {},
  onReset,
  onClearFilters,
  onReload,
  onBack,
  loading = false,
}) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="topology-toolbar topology-toolbar-floating">
      <div className="topology-toolbar-compact">
        <div className="topology-mode-switch">
          <button type="button" className={activeView === 'graph' ? 'primary' : ''} onClick={() => onViewChange('graph')}>
            Graph
          </button>
          <button type="button" className={activeView === 'radial' ? 'primary' : ''} onClick={() => onViewChange('radial')}>
            Radial
          </button>
          <button type="button" className={activeView === 'rack' ? 'primary' : ''} onClick={() => onViewChange('rack')}>
            Rack
          </button>
        </div>
        <button type="button" className={showFilters ? 'primary' : ''} onClick={() => setShowFilters((value) => !value)}>
          Filters
        </button>
        {onBack && (
          <button type="button" onClick={onBack}>
            Back
          </button>
        )}
      </div>

      <div className="topology-toolbar-actions topology-toolbar-actions-compact">
        <button type="button" className={focusMode ? 'primary' : ''} onClick={onToggleFocusMode}>
          Focus
        </button>
        <button type="button" className={blastMode ? 'primary' : ''} onClick={onToggleBlastMode} disabled={!selectedEntityId}>
          Blast
        </button>
        <button type="button" className={pathMode ? 'primary' : ''} onClick={onTogglePathMode}>
          Path
        </button>
        <button type="button" className={heatmapMode ? 'primary' : ''} onClick={onToggleHeatmapMode}>
          Heatmap
        </button>
        <button type="button" className={propagationMode ? 'primary' : ''} onClick={onTogglePropagationMode}>
          Pulse
        </button>
        <button type="button" onClick={onAutoDetectRootCause}>
          Auto Root Cause
        </button>
        {pathMode && (
          <button type="button" onClick={onClearPathMode}>
            Clear Path
          </button>
        )}
        <button type="button" onClick={onReset}>Reset</button>
        <button type="button" onClick={onReload} disabled={loading || !filters.workspace_id}>
          {loading ? 'Loading' : 'Reload'}
        </button>
      </div>

      {showFilters && (
        <div className="topology-toolbar-filters">
          <label>
            Workspace ID
            <input
              value={filters.workspace_id || ''}
              onChange={(event) => onFilterChange('workspace_id', event.target.value)}
              placeholder="workspace_id"
            />
          </label>
          <label>
            Facility ID
            <input
              value={filters.facility_id || ''}
              onChange={(event) => onFilterChange('facility_id', event.target.value)}
              placeholder="optional"
            />
          </label>
          <label>
            Entity ID
            <input
              value={entityInputValue}
              onChange={(event) => {
                if (onEntityInputChange) {
                  onEntityInputChange(event.target.value);
                  return;
                }
                onFilterChange('entity_id', event.target.value);
              }}
              onBlur={(event) => {
                if (onEntityInputCommit) onEntityInputCommit(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (onEntityInputCommit) onEntityInputCommit(event.currentTarget.value);
              }}
              placeholder="optional"
            />
          </label>
          <label>
            Severity
            <select
              value={filters.severity || ''}
              onChange={(event) => onFilterChange('severity', event.target.value)}
            >
              <option value="">ALL</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
            </select>
          </label>
          <div className="topology-filter-grid-actions">
            <button type="button" onClick={onClearFilters}>Clear Filters</button>
          </div>
          <div className="topology-layer-toggle-wrap">
            <span>Layers</span>
            <div className="topology-layer-toggle-grid">
              <button type="button" className={layerToggles.structural ? 'primary' : ''} onClick={() => onToggleLayer('structural')}>
                Structural
              </button>
              <button type="button" className={layerToggles.network ? 'primary' : ''} onClick={() => onToggleLayer('network')}>
                Network
              </button>
              <button type="button" className={layerToggles.power ? 'primary' : ''} onClick={() => onToggleLayer('power')}>
                Power
              </button>
              <button type="button" className={layerToggles.cooling ? 'primary' : ''} onClick={() => onToggleLayer('cooling')}>
                Cooling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
