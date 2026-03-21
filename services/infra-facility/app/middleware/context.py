import uuid
from typing import Optional
from fastapi import Request, HTTPException

class WorkspaceContext:
    def __init__(self, workspace_id: Optional[uuid.UUID] = None):
        self.workspace_id = workspace_id

async def inject_workspace_context(request: Request):
    workspace_id = request.headers.get("X-Workspace-Id")
    
    if not workspace_id:
        request.state.workspace = WorkspaceContext(workspace_id=None)
        return

    try:
        request.state.workspace = WorkspaceContext(
            workspace_id=uuid.UUID(workspace_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-Workspace-Id header format")
