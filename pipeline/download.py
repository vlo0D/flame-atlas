"""Polite HTTP client: one session, pause between requests, retries, atomic writes."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

from pipeline import log

_log = log.get("pipeline.http")


class Http:
    def __init__(self, http_cfg: Dict[str, Any]):
        self.pause = float(http_cfg.get("pauseSeconds", 0.5))
        self.timeout = float(http_cfg.get("timeoutSeconds", 60))
        self.retries = int(http_cfg.get("retries", 3))
        self.backoff = float(http_cfg.get("backoffSeconds", 2.0))
        self.session = requests.Session()
        self.session.headers["User-Agent"] = http_cfg.get("userAgent", "flame-atlas-pipeline")
        self._last = 0.0

    def _wait(self) -> None:
        delta = time.monotonic() - self._last
        if delta < self.pause:
            time.sleep(self.pause - delta)
        self._last = time.monotonic()

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            self._wait()
            try:
                resp = self.session.request(method, url, **kwargs)
                if resp.status_code >= 500 or resp.status_code == 429:
                    raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
                resp.raise_for_status()
                return resp
            except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as exc:
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status is not None and 400 <= status < 500 and status != 429:
                    raise
                last_exc = exc
                _log.warning("%s %s failed (attempt %d/%d): %s", method, url[:120], attempt, self.retries, exc)
                time.sleep(self.backoff * attempt)
        assert last_exc is not None
        raise last_exc

    def get_json(self, url: str, **kwargs) -> Any:
        return self.request("GET", url, **kwargs).json()

    def post_json(self, url: str, body: Any, timeout: Optional[float] = None) -> Any:
        return self.request("POST", url, json=body, timeout=timeout or self.timeout).json()

    def get_text(self, url: str, **kwargs) -> str:
        return self.request("GET", url, **kwargs).text

    def download(self, url: str, dest: Path) -> str:
        """Stream `url` into `dest` atomically; return the SHA-256 of the bytes."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".part")
        digest = hashlib.sha256()
        resp = self.request("GET", url, stream=True)
        try:
            with tmp.open("wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 16):
                    if chunk:
                        fh.write(chunk)
                        digest.update(chunk)
        finally:
            resp.close()
        tmp.replace(dest)
        return digest.hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()
