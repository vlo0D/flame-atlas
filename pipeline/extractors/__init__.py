"""Extractor registry: file extension → extractor class.

To support a new format, write a subclass of `Extractor` with `extensions = ("pptx",)`,
add it to `EXTRACTORS` below and add the extension to `selection.allowedExtensions` in the config.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Type

from pipeline.extractors.base import Extractor
from pipeline.extractors.csv_extractor import CsvExtractor
from pipeline.extractors.docx_extractor import DocxExtractor
from pipeline.extractors.pdf_extractor import PdfExtractor
from pipeline.extractors.xlsx_extractor import XlsxExtractor

EXTRACTORS: List[Type[Extractor]] = [CsvExtractor, XlsxExtractor, DocxExtractor, PdfExtractor]


def registry() -> Dict[str, Type[Extractor]]:
    out: Dict[str, Type[Extractor]] = {}
    for cls in EXTRACTORS:
        for ext in cls.extensions:
            out[ext.lower()] = cls
    return out


def for_extension(ext: str, options: Optional[Dict[str, Any]] = None) -> Optional[Extractor]:
    cls = registry().get(ext.lower().lstrip("."))
    return cls(options) if cls else None
