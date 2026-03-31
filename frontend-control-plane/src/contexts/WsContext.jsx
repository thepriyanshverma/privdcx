/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import WsEngine from '../services/ws';
import { useAuth } from './AuthContext';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [lastMessage, setLastMessage] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const engineRef = useRef(null);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      if (engineRef.current) {
        engineRef.current.disconnect();
        engineRef.current = null;
      }
      return;
    }

    const engine = new WsEngine({ onStatusChange: setWsStatus });
    const unsubscribe = engine.subscribe((payload) => setLastMessage(payload));
    engineRef.current = engine;
    engine.connect();

    return () => {
      unsubscribe();
      engine.disconnect();
    };
  }, [user]);

  const value = useMemo(
    () => ({
      wsStatus,
      lastMessage,
      subscribe: (handler) => {
        if (!engineRef.current) {
          return () => {};
        }
        return engineRef.current.subscribe(handler);
      },
    }),
    [wsStatus, lastMessage],
  );

  return (
    <WsContext.Provider value={value}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs() {
  return useContext(WsContext);
}
