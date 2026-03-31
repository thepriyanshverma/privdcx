/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function userFromToken(token) {
  const claims = parseJwt(token);
  if (!claims) return null;
  return {
    id: claims.sub || null,
    email: claims.email || null,
  };
}

function getId(item, keys) {
  for (const key of keys) {
    if (item?.[key]) return String(item[key]);
  }
  return null;
}

function findById(items, id, keys) {
  const target = String(id || '');
  if (!target) return null;
  return items.find((item) => getId(item, keys) === target) || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const clearContextState = useCallback(() => {
    localStorage.removeItem('active_org_id');
    localStorage.removeItem('active_workspace_id');
    setOrg(null);
    setWorkspace(null);
    setOrganizations([]);
    setWorkspaces([]);
  }, []);

  const refreshBootstrapState = useCallback(async () => {
    const me = await api.get('/v1/auth/me');
    const meUser = {
      id: me?.user_id || me?.id || null,
      email: me?.email || null,
    };
    setUser(meUser.id || meUser.email ? meUser : userFromToken(localStorage.getItem('access_token')));

    const orgResponse = await api.get('/v1/tenants/organizations/me');
    const orgList = Array.isArray(orgResponse) ? orgResponse : orgResponse?.items || [];
    setOrganizations(orgList);

    const activeOrgId = localStorage.getItem('active_org_id') || me?.active_org_id || me?.org_id;
    const selectedOrg = findById(orgList, activeOrgId, ['organization_id', 'org_id', 'id']);
    setOrg(selectedOrg);
    if (selectedOrg) {
      localStorage.setItem('active_org_id', getId(selectedOrg, ['organization_id', 'org_id', 'id']));
    } else {
      clearContextState();
      return;
    }

    const selectedOrgId = getId(selectedOrg, ['organization_id', 'org_id', 'id']);
    const wsResponse = await api.get(`/v1/tenants/workspaces?org_id=${selectedOrgId}`);
    const wsList = Array.isArray(wsResponse) ? wsResponse : wsResponse?.items || [];
    setWorkspaces(wsList);

    const activeWorkspaceId = localStorage.getItem('active_workspace_id') || me?.last_workspace_id || me?.workspace_id;
    const selectedWorkspace = findById(wsList, activeWorkspaceId, ['workspace_id', 'id']);
    setWorkspace(selectedWorkspace);
    if (selectedWorkspace) {
      localStorage.setItem('active_workspace_id', getId(selectedWorkspace, ['workspace_id', 'id']));
    } else {
      localStorage.removeItem('active_workspace_id');
    }
  }, []);

  useEffect(() => {
    async function bootstrapAuth() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setUser(userFromToken(token));
        await refreshBootstrapState();
      } catch (err) {
        if (err?.status === 401) {
          logout();
        } else {
          clearContextState();
          setUser(userFromToken(token));
        }
      } finally {
        setLoading(false);
      }
    }
    bootstrapAuth();
  }, [refreshBootstrapState]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const data = await api.post('/v1/tenants/auth/login', { email, password });
      localStorage.setItem('access_token', data.access_token);
      setUser(userFromToken(data.access_token));
      clearContextState();
      await refreshBootstrapState();
      return data;
    } finally {
      setLoading(false);
    }
  }, [clearContextState, refreshBootstrapState]);

  const selectOrg = useCallback(async (nextOrg) => {
    const orgId = getId(nextOrg, ['organization_id', 'org_id', 'id']);
    localStorage.setItem('active_org_id', orgId);
    localStorage.removeItem('active_workspace_id');
    setOrg(nextOrg);
    setWorkspace(null);
    const wsResponse = await api.get(`/v1/tenants/workspaces?org_id=${orgId}`);
    const wsList = Array.isArray(wsResponse) ? wsResponse : wsResponse?.items || [];
    setWorkspaces(wsList);
  }, []);

  const selectWorkspace = useCallback(async (nextWorkspace) => {
    const workspaceId = getId(nextWorkspace, ['workspace_id', 'id']);
    localStorage.setItem('active_workspace_id', workspaceId);
    setWorkspace(nextWorkspace);
    await api.patch('/v1/auth/me', { last_workspace_id: workspaceId });
    await refreshBootstrapState();
  }, [refreshBootstrapState]);

  const refreshOrganizations = useCallback(async () => {
    const orgResponse = await api.get('/v1/tenants/organizations/me');
    const orgList = Array.isArray(orgResponse) ? orgResponse : orgResponse?.items || [];
    setOrganizations(orgList);
    const activeOrgId = localStorage.getItem('active_org_id');
    setOrg(findById(orgList, activeOrgId, ['organization_id', 'org_id', 'id']));
    return orgList;
  }, []);

  const refreshWorkspaces = useCallback(async (orgIdOverride) => {
    const currentOrgId = orgIdOverride || localStorage.getItem('active_org_id') || getId(org, ['organization_id', 'org_id', 'id']);
    if (!currentOrgId) {
      setWorkspaces([]);
      return [];
    }
    const wsResponse = await api.get(`/v1/tenants/workspaces?org_id=${currentOrgId}`);
    const wsList = Array.isArray(wsResponse) ? wsResponse : wsResponse?.items || [];
    setWorkspaces(wsList);
    const activeWorkspaceId = localStorage.getItem('active_workspace_id');
    setWorkspace(findById(wsList, activeWorkspaceId, ['workspace_id', 'id']));
    return wsList;
  }, [org]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    clearContextState();
    setUser(null);
  }, [clearContextState]);

  const value = useMemo(() => ({
    user,
    org,
    workspace,
    organizations,
    workspaces,
    loading,
    login,
    logout,
    selectOrg,
    selectWorkspace,
    refreshOrganizations,
    refreshWorkspaces,
    refreshBootstrapState,
  }), [user, org, workspace, organizations, workspaces, loading, login, logout, selectOrg, selectWorkspace, refreshOrganizations, refreshWorkspaces, refreshBootstrapState]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
