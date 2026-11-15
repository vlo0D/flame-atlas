"""Common document model shared by every format-specific extractor.

An extractor reads one local file and returns an ordered list of blocks:

* TextBlock  — a heading, paragraph, list item or a page of text, verbatim;
* TableBlock — a grid with column names and rows; every row keeps its cells as raw strings
               and the row number in the source (contract rule 4: `raw` is always kept).

Extractors never touch the network and never interpret values (no units, no numbers):
that is the job of the table mapping stage.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar, Dict, List, Optional, Tuple, Union

SCHEMA_VERSION = "1.0.0"


@dataclass
class TextBlock:
    text: str
    kind: str = "paragraph"            # heading | paragraph | list-item | page | caption
    location: Dict[str, Any] = field(default_factory=dict)
    level: Optional[int] = None        # heading level, 1 = top
    style: Optional[str] = None        # source style name, if any

    def to_json(self, block_id: str) -> Dict[str, Any]:
        return {"type": "text", "id": block_id, "kind": self.kind, "level": self.level,
                "style": self.style, "text": self.text, "location": self.location}


@dataclass
class TableRow:
    source_row: int                    # 1 = first data row after the header row
    raw: Dict[str, str]


@dataclass
class TableBlock:
    name: str
    columns: List[str]
    rows: List[TableRow]
    location: Dict[str, Any] = field(default_factory=dict)
    header_row: Optional[int] = None   # 1-based physical row of the header in the source grid
    confidence: str = "high"           # high: native grid (CSV/XLSX/DOCX); low: detected (PDF)
    truncated: bool = False

    def to_json(self, block_id: str) -> Dict[str, Any]:
        return {"type": "table", "id": block_id, "name": self.name, "confidence": self.confidence,
                "location": self.location, "headerRow": self.header_row, "columns": self.columns,
                "rowCount": len(self.rows), "truncated": self.truncated,
                "rows": [{"sourceRow": r.source_row, "raw": r.raw} for r in self.rows]}


Block = Union[TextBlock, TableBlock]


@dataclass
class ExtractionResult:
    blocks: List[Block] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    pages: Optional[int] = None
    status: str = "ok"                 # ok | partial | failed


class Extractor(ABC):
    """Base class. Subclasses set `name`, `version`, `extensions` and implement `extract`."""

    name: ClassVar[str] = "base"
    version: ClassVar[str] = "1.0.0"
    extensions: ClassVar[Tuple[str, ...]] = ()

    def __init__(self, options: Optional[Dict[str, Any]] = None):
        self.options = options or {}
        self._rows_used = 0

    def row_limit(self) -> Optional[int]:
        """Rows the next table may take: min(maxTableRows, what is left of maxRowsPerDocument)."""
        limits = []
        if self.options.get("maxTableRows") is not None:
            limits.append(int(self.options["maxTableRows"]))
        if self.options.get("maxRowsPerDocument") is not None:
            limits.append(max(0, int(self.options["maxRowsPerDocument"]) - self._rows_used))
        return min(limits) if limits else None

    def count_rows(self, table: Optional["TableBlock"]) -> None:
        if table is not None:
            self._rows_used += len(table.rows)

    @abstractmethod
    def extract(self, path: Path) -> ExtractionResult:
        """Read `path` and return blocks in document order."""


def stats(result: ExtractionResult) -> Dict[str, Any]:
    texts = [b for b in result.blocks if isinstance(b, TextBlock)]
    tables = [b for b in result.blocks if isinstance(b, TableBlock)]
    return {
        "textBlocks": len(texts),
        "characters": sum(len(b.text) for b in texts),
        "tables": len(tables),
        "tableRows": sum(len(t.rows) for t in tables),
        "pages": result.pages,
    }


def blocks_to_json(blocks: List[Block]) -> List[Dict[str, Any]]:
    return [b.to_json(f"b{i}") for i, b in enumerate(blocks, start=1)]
