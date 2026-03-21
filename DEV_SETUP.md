# DesignDC Infrastructure OS — Run Guide

This document details the commands required to set up and run the DesignDC Infrastructure OS project locally.

## Prerequisites

- **Python**: 3.9+
- **Node.js**: 18+
- **npm**: 9+

---

## 1. Backend Setup (FastAPI)

The backend is located in the `/backend` directory. It uses FastAPI with an asynchronous SQLite database.

### Initial Setup
1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```
2. **Create a virtual environment** (if not already created):
   ```bash
   python -m venv venv
   ```
3. **Activate the virtual environment**:
   - **Windows**: `venv\Scripts\activate`
   - **Unix/macOS**: `source venv/bin/activate`
4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Backend
Run the FastAPI application using Uvicorn:
```bash
uvicorn app.main:app --reload --port 8000
```
- The backend will be available at: [http://localhost:8000](http://localhost:8000)
- API Documentation (Swagger UI): [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 2. Frontend Setup (Vite + React)

The frontend is located in the `/network-sim` directory.

### Initial Setup
1. **Navigate to the frontend directory**:
   ```bash
   cd network-sim
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```

### Running the Frontend
Start the Vite development server:
```bash
npm run dev
```
- The frontend will be available at: [http://localhost:5173](http://localhost:5173)

### Additional Tools
- **Proxy Server**: If you need to access the app via port 5174 (e.g., for specific environment routing), you can run:
  ```bash
  node proxy-server.cjs
  ```

---

## 3. Development Workflow

- Both the **Backend** and **Frontend** must be running simultaneously for the application to function correctly.
- The backend handles data persistence and infrastructure simulation logic.
- The frontend provides the 3D Digital Twin visualization and Operator OS interface.
