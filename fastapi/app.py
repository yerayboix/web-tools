from fastapi import FastAPI, HTTPException, Request, WebSocket
from typing import Dict, List
import yt_dlp
import os
import json
import asyncio
from functools import partial

app = FastAPI()

# Almacén de conexiones WebSocket activas
active_connections: Dict[str, WebSocket] = {}

# Carpeta donde se guardarán los videos
DOWNLOAD_FOLDER = "downloads"
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    active_connections[client_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except:
        del active_connections[client_id]

@app.post("/download/")
async def download_video(request: Request):
    """Descarga un video de YouTube y lo guarda en la carpeta 'downloads/'."""
    websocket = None
    try:
        data = await request.json()
        url = data.get("url")
        client_id = data.get("client_id")
        
        if not url or not client_id:
            raise HTTPException(status_code=400, detail="URL and client_id are required")

        websocket = active_connections.get(client_id)
        if not websocket:
            raise HTTPException(status_code=400, detail="WebSocket connection not found")

        loop = asyncio.get_event_loop()

        def progress_hook(d, websocket=websocket, loop=loop):
            """Función no asíncrona que envía actualizaciones a través del WebSocket"""
            try:
                if d['status'] == 'downloading':
                    total_bytes = d.get('total_bytes')
                    downloaded_bytes = d.get('downloaded_bytes', 0)
                    if total_bytes:
                        percentage = (downloaded_bytes / total_bytes) * 100
                        speed = d.get('speed', 0)
                        if speed:
                            speed = speed / 1024 / 1024  # Convertir a MB/s

                        async def send_progress():
                            await websocket.send_json({
                                "type": "progress",
                                "progress": percentage,
                                "speed": f"{speed:.2f} MB/s" if speed else "Calculando..."
                            })
                        
                        asyncio.run_coroutine_threadsafe(send_progress(), loop)

                elif d['status'] == 'finished':
                    async def send_finished():
                        await websocket.send_json({
                            "type": "progress",
                            "progress": 100,
                            "status": "Procesando..."
                        })
                    
                    asyncio.run_coroutine_threadsafe(send_finished(), loop)

            except Exception as e:
                print(f"Error in progress_hook: {str(e)}")

        ydl_opts = {
            "outtmpl": os.path.join(DOWNLOAD_FOLDER, "%(title)s.%(ext)s"),
            "format": "best",
            "progress_hooks": [progress_hook],
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info)
            
        if websocket:
            await websocket.send_json({
                "type": "complete",
                "data": {
                    "message": "Descarga completa",
                    "file_path": file_path,
                    "title": info.get('title'),
                    "thumbnail": info.get('thumbnail'),
                    "duration": info.get('duration')
                }
            })
            
        return {"message": "Proceso iniciado"}

    except HTTPException as he:
        if websocket:
            await websocket.send_json({
                "type": "error",
                "message": he.detail
            })
        raise he
    except Exception as e:
        print(f"Error: {str(e)}")
        if websocket:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        raise HTTPException(status_code=500, detail=str(e))