"""Shared logging setup for pipeline CLIs."""
from __future__ import annotations

import logging


def setup(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # pdfminer is extremely chatty at INFO/DEBUG.
    logging.getLogger("pdfminer").setLevel(logging.ERROR)


def get(name: str) -> logging.Logger:
    return logging.getLogger(name)
