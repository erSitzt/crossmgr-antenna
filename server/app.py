"""Live reader bridge for the antenna planner.

    pip install -r requirements.txt
    python app.py            # http://127.0.0.1:18787  (serves ../web/dist if built)

WebSocket /ws protocol (JSON):
  client -> server: {"cmd": "connect", "host": "192.168.1.50", "mock": false}
                    {"cmd": "configure", "antennas": [{"port":1,"txDbm":27,"enabled":true}], "rxSensDbm": -70}
                    {"cmd": "start"} | {"cmd": "stop"} | {"cmd": "disconnect"}
  server -> client: {"type": "status", ...} | {"type": "reads", "reads": [{"epc","port","rssi","ts"}]}
                    {"type": "error", "message": "..."}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from llrp_client import AntennaConfig, LlrpReader, MockReader, ReaderConfig

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("antenna-server")



class Hub:
    """One reader session shared by all connected browser tabs."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.reader = None
        self._buffer: list[dict] = []

    # called from reader threads
    def push_reads(self, reads: list[dict]) -> None:
        if self.loop:
            self.loop.call_soon_threadsafe(self._buffer.extend, reads)

    def push_status(self, status: dict) -> None:
        if self.loop:
            self.loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self.broadcast(status)))

    async def broadcast(self, msg: dict) -> None:
        data = json.dumps(msg)
        for ws in list(self.clients):
            try:
                await ws.send_text(data)
            except Exception:
                self.clients.discard(ws)

    async def flush_loop(self) -> None:
        # batch reads every 50 ms to keep the socket light
        while True:
            await asyncio.sleep(0.05)
            if self._buffer:
                reads, self._buffer = self._buffer, []
                await self.broadcast({"type": "reads", "reads": reads})

    async def handle(self, msg: dict) -> None:
        cmd = msg.get("cmd")
        if cmd == "connect":
            if self.reader:
                await asyncio.to_thread(self.reader.disconnect)
            cls = MockReader if msg.get("mock") else LlrpReader
            self.reader = cls(self.push_reads, self.push_status)
            await asyncio.to_thread(self.reader.connect, msg.get("host", ""), int(msg.get("port", 5084)))
        elif cmd == "configure" and self.reader:
            cfg = ReaderConfig(
                antennas=[AntennaConfig(int(a["port"]), float(a["txDbm"]), bool(a.get("enabled", True)))
                          for a in msg.get("antennas", [])],
                rx_sens_dbm=float(msg.get("rxSensDbm", -80)),
            )
            await asyncio.to_thread(self.reader.configure, cfg)
        elif cmd == "start" and self.reader:
            await asyncio.to_thread(self.reader.start)
        elif cmd == "stop" and self.reader:
            await asyncio.to_thread(self.reader.stop)
        elif cmd == "disconnect" and self.reader:
            await asyncio.to_thread(self.reader.disconnect)
            self.reader = None
        elif cmd == "status":
            await self.broadcast(self.reader.status() if self.reader else
                                 {"type": "status", "connected": False, "running": False, "message": "idle"})
        else:
            raise ValueError(f"unknown or invalid command: {cmd}")


hub = Hub()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    hub.loop = asyncio.get_running_loop()
    task = asyncio.create_task(hub.flush_loop())
    yield
    task.cancel()
    if hub.reader:
        await asyncio.to_thread(hub.reader.disconnect)


app = FastAPI(title="crossmgr-antenna live bridge", lifespan=lifespan)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "reader": hub.reader.status() if hub.reader else None}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    hub.clients.add(ws)
    try:
        await hub.handle({"cmd": "status"})
        while True:
            msg = json.loads(await ws.receive_text())
            try:
                await hub.handle(msg)
            except Exception as e:  # report errors to the UI instead of dropping the socket
                log.exception("command failed")
                await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


dist = Path(__file__).resolve().parent.parent / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
else:

    @app.get("/", response_class=HTMLResponse)
    async def no_frontend() -> str:
        return (
            "<h2>crossmgr-antenna backend is running</h2>"
            "<p>The web app is not built. Run <code>npm run build</code> in <code>web/</code> and restart, "
            "use the dev server at <a href='http://localhost:5173'>localhost:5173</a>, "
            "or run <code>docker compose up --build</code>.</p>"
        )


if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "18787")))
