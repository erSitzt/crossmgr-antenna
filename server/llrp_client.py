"""Thin wrapper around sllurp for direct LLRP access to an Impinj reader.

CrossMgrImpinj must be stopped while this is connected: the reader accepts only one LLRP client.

Notes / assumptions (verify against your sllurp version and reader):
  * Tx power is passed as dBm per port (sllurp `tx_power_dbm`); sllurp picks the closest entry
    of the reader's power table.
  * Receiver sensitivity is applied as a software RSSI filter (reads below the threshold are dropped).
"""
from __future__ import annotations

import logging
import math
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

log = logging.getLogger(__name__)

ReadCallback = Callable[[list[dict]], None]


@dataclass
class AntennaConfig:
    port: int
    tx_dbm: float
    enabled: bool = True


@dataclass
class ReaderConfig:
    antennas: list[AntennaConfig] = field(default_factory=list)
    rx_sens_dbm: float = -80.0


class LlrpReader:
    def __init__(self, on_reads: ReadCallback, on_status: Callable[[dict], None]):
        self.on_reads = on_reads
        self.on_status = on_status
        self.host: Optional[str] = None
        self.config = ReaderConfig()
        self._client = None
        self._port = 5084
        self._running = False
        self._power_table: list[float] = []

    # -- status -------------------------------------------------------------------------------
    def status(self, message: str = "") -> dict:
        return {
            "type": "status",
            "mode": "llrp",
            "connected": self._client is not None,
            "running": self._running,
            "host": self.host,
            "powerTable": self._power_table,
            "message": message,
        }

    # -- lifecycle ----------------------------------------------------------------------------
    def connect(self, host: str, port: int = 5084) -> None:
        self.host = host
        self._port = port
        self.on_status(self.status(f"Connecting to {host}:{port} …"))
        # Actual LLRP session is created on start(), because sllurp starts inventory on connect.
        self._client = object()  # placeholder marker: "configured"
        self.on_status(self.status("Ready. Push antenna config and press Start."))

    def configure(self, cfg: ReaderConfig) -> None:
        self.config = cfg
        restart = self._running
        if restart:
            self.stop()
            self.start()
        self.on_status(self.status("Antenna config stored" + (" and applied" if restart else "")))

    def start(self) -> None:
        if not self.host:
            raise RuntimeError("not connected")
        try:
            from sllurp.llrp import LLRPReaderClient, LLRPReaderConfig  # type: ignore
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("sllurp is not installed (pip install sllurp)") from e

        enabled = [a for a in self.config.antennas if a.enabled] or [AntennaConfig(1, 30.0)]
        # sllurp >= 2 picks the closest entry of the reader's power table for each antenna
        tx_power_dbm = {a.port: float(a.tx_dbm) for a in enabled}
        config = LLRPReaderConfig({
            "antennas": [a.port for a in enabled],
            "tx_power_dbm": tx_power_dbm,
            "report_every_n_tags": 1,
            "start_inventory": True,
            "tag_content_selector": {
                "EnableROSpecID": False,
                "EnableSpecIndex": False,
                "EnableInventoryParameterSpecID": False,
                "EnableAntennaID": True,
                "EnableChannelIndex": False,
                "EnablePeakRSSI": True,
                "EnableFirstSeenTimestamp": True,
                "EnableLastSeenTimestamp": True,
                "EnableTagSeenCount": True,
                "EnableAccessSpecID": False,
            },
        })
        client = LLRPReaderClient(self.host, self._port, config)
        client.add_tag_report_callback(self._on_tag_report)
        client.connect()
        self._client = client
        self._running = True
        self._power_table = [p for p in (getattr(client.llrp, "tx_power_table", None) or []) if p]
        self.on_status(self.status(f"Inventory running, Tx power per port: {tx_power_dbm} dBm"))

    def stop(self) -> None:
        client = self._client
        self._running = False
        if client is not None and hasattr(client, "disconnect"):
            try:
                client.disconnect()
                if hasattr(client, "join"):
                    client.join(5)
            except Exception:  # pragma: no cover
                log.exception("disconnect failed")
            self._client = object()
        self.on_status(self.status("Stopped"))

    def disconnect(self) -> None:
        if self._running:
            self.stop()
        self._client = None
        self.host = None
        self.on_status(self.status("Disconnected"))

    # -- reads --------------------------------------------------------------------------------
    def _on_tag_report(self, _reader, tags: list[dict]) -> None:
        out = []
        for t in tags:
            epc = t.get("EPC-96") or t.get("EPC") or t.get("EPCData") or b""
            if isinstance(epc, (bytes, bytearray)):
                epc = epc.decode("ascii", "replace") if all(32 <= c < 127 for c in epc) else epc.hex()
            rssi = t.get("PeakRSSI")
            if rssi is None or rssi < self.config.rx_sens_dbm:
                continue
            ts = t.get("FirstSeenTimestampUTC") or t.get("LastSeenTimestampUTC") or int(time.time() * 1e6)
            out.append({"epc": str(epc), "port": int(t.get("AntennaID", 0)), "rssi": float(rssi), "ts": int(ts)})
        if out:
            self.on_reads(out)


class MockReader:
    """Generates synthetic passes so the live UI can be exercised without hardware."""

    def __init__(self, on_reads: ReadCallback, on_status: Callable[[dict], None]):
        self.on_reads = on_reads
        self.on_status = on_status
        self.config = ReaderConfig(antennas=[AntennaConfig(1, 30), AntennaConfig(2, 30), AntennaConfig(3, 30)])
        self._thread: Optional[threading.Thread] = None
        self._running = False

    def status(self, message: str = "") -> dict:
        return {"type": "status", "mode": "mock", "connected": True, "running": self._running,
                "host": "mock", "powerTable": [], "message": message}

    def connect(self, host: str, port: int = 5084) -> None:
        self.on_status(self.status("Mock reader ready"))

    def configure(self, cfg: ReaderConfig) -> None:
        self.config = cfg
        self.on_status(self.status("Mock config stored"))

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self.on_status(self.status("Mock inventory running (a pass every ~4 s)"))

    def stop(self) -> None:
        self._running = False
        self.on_status(self.status("Stopped"))

    def disconnect(self) -> None:
        self.stop()

    def _loop(self) -> None:
        ports = [a for a in self.config.antennas if a.enabled] or [AntennaConfig(1, 30)]
        n = 0
        while self._running:
            n += 1
            epc = f"MOCK{n % 5:04d}"
            t_cross = time.time() + 1.0
            speed = random.uniform(8, 14)  # m/s
            lateral = random.uniform(-3, 3)
            offsets = {a.port: random.uniform(-1.5, 1.5) for a in ports}
            t = t_cross - 1.0
            while self._running and t < t_cross + 1.0:
                a = ports[int(t * 40) % len(ports)]
                d = math.hypot((t - t_cross) * speed, lateral + 4 + a.port) + 0.5
                rssi = a.tx_dbm - 50 - 40 * math.log10(d) + offsets[a.port] + random.gauss(0, 2)
                if rssi > self.config.rx_sens_dbm and random.random() < 0.8:
                    self.on_reads([{"epc": epc, "port": a.port, "rssi": round(rssi), "ts": int(t * 1e6)}])
                t += 0.0025
                time.sleep(0.0025)
            time.sleep(random.uniform(2, 4))
