const WS_URL = 'ws://localhost:8000/ws/infra-state';

class WsEngine {
  constructor({ onStatusChange }) {
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.stopped = false;
    this.retryMs = 1000;
    this.maxRetryMs = 15000;
    this.subscribers = new Set();
  }

  subscribe(handler) {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  broadcast(payload) {
    this.subscribers.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        // Ignore subscriber callback errors.
      }
    });
  }

  connect() {
    if (this.stopped) return;
    this.onStatusChange?.('connecting');
    const token = localStorage.getItem('access_token');
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.retryMs = 1000;
      this.onStatusChange?.('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.broadcast(payload);
      } catch {
        // Ignore malformed frames.
      }
    };

    this.ws.onerror = () => {
      this.onStatusChange?.('error');
    };

    this.ws.onclose = () => {
      if (this.stopped) return;
      this.onStatusChange?.('reconnecting');
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
    };
  }

  disconnect() {
    this.stopped = true;
    this.ws?.close();
  }
}

export default WsEngine;
