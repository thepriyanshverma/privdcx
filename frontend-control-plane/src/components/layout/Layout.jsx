import { Outlet, NavLink } from 'react-router-dom'
import TopHeader from './TopHeader'
import './Layout.css'

export function Layout() {
  return (
    <div className="layout-root">
      <TopHeader />
      
      <div className="layout-body">
        <nav className="left-nav">
          <NavSection title="Design">
            <NavLink to="/app/design/facility" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Facility</NavLink>
            <NavLink to="/app/design/topology" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Topology</NavLink>
            <NavLink to="/app/design/devices" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Devices</NavLink>
            <NavLink to="/app/design/validation" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Validation</NavLink>
          </NavSection>

          <NavSection title="Deploy">
            <NavLink to="/app/deploy/plan" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Deployment Plan</NavLink>
            <NavLink to="/app/deploy/allocation" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Allocation</NavLink>
          </NavSection>

          <NavSection title="Operate">
            <NavLink to="/app/operate/runtime" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Runtime State</NavLink>
            <NavLink to="/app/operate/telemetry" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Telemetry</NavLink>
            <NavLink to="/app/operate/simulation" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Simulation</NavLink>
          </NavSection>

          <NavSection title="Incident">
            <NavLink to="/app/incident/war-room" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>War Room</NavLink>
            <NavLink to="/topology" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Topology</NavLink>
            <NavLink to="/app/incident/alerts" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Alerts</NavLink>
            <NavLink to="/app/incident/failures" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Failure Graph</NavLink>
          </NavSection>

          <NavSection title="Governance">
            <NavLink to="/app/governance/members" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Members</NavLink>
            <NavLink to="/app/governance/invitations" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Invitations</NavLink>
          </NavSection>

          <NavSection title="Platform">
            <NavLink to="/app/platform/subscription" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Subscription</NavLink>
            <NavLink to="/app/platform/settings" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>Settings</NavLink>
          </NavSection>
        </nav>
        
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavSection({ title, children }) {
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      <div className="nav-section-items">
        {children}
      </div>
    </div>
  )
}
