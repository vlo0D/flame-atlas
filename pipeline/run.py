"""One command: PSI → the four contract JSON files in data/processed (+ document JSON).

    python3 -m pipeline                          # everything
    python3 -m pipeline --ids PSI-25 PSI-99      # only these investigations (download step)
    python3 -m pipeline --skip-download          # rebuild from what is already in data/raw
    python3 -m pipeline --skip-documents         # contract files only (fast)
    python3 -m pipeline --dry-run                # show what would be downloaded, change nothing

Steps:
    1. download   data/raw/<id>/metadata.json, files.json, experimental tables and documents
    2. contract   data/processed/tests.json, investigations.json, scenarios.json, meta.json,
                  checked with contracts/validate.py (format in contracts/README.md)
    3. documents  data/extracted/<id>/<file>.json + index.json: text and tables of every
                  pdf/docx/csv/xlsx document (slow on the first run, incremental afterwards)

Re-running is incremental: nothing already downloaded or extracted is processed again (use --force).
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from typing import List, Optional

REQUIRED = {"requests": "requests", "openpyxl": "openpyxl", "docx": "python-docx", "pdfplumber": "pdfplumber"}


def check_environment() -> Optional[str]:
    if sys.version_info < (3, 9):
        return f"Python 3.9+ is required, this is {sys.version.split()[0]}"
    missing = [pkg for module, pkg in REQUIRED.items() if importlib.util.find_spec(module) is None]
    if missing:
        return ("missing packages: " + ", ".join(missing) + "\n"
                "install them with:\n    python3 -m pip install -r pipeline/requirements.txt")
    return None


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python3 -m pipeline", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", help="alternative config JSON (default pipeline/config/ingest.json)")
    p.add_argument("--ids", nargs="+", help="only these investigation ids")
    p.add_argument("--query", help="PSI search term (default: combustion)")
    p.add_argument("--ext", nargs="+", help="file formats to download (default: pdf docx csv xlsx)")
    p.add_argument("--max-size-mb", type=float, help="skip files larger than this (default: 60)")
    p.add_argument("--skip-download", action="store_true", help="only extract files already in data/raw")
    p.add_argument("--skip-contract", action="store_true", help="do not build data/processed")
    p.add_argument("--skip-documents", action="store_true", help="do not extract document text and tables")
    p.add_argument("--no-pdf-tables", action="store_true", help="PDF text only (much faster)")
    p.add_argument("--dry-run", action="store_true", help="list what would be downloaded and stop")
    p.add_argument("--force", action="store_true", help="download and extract again")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def _common(args: argparse.Namespace) -> List[str]:
    out: List[str] = []
    if args.config:
        out += ["--config", args.config]
    if args.ids:
        out += ["--ids", *args.ids]
    if args.force:
        out.append("--force")
    if args.verbose:
        out.append("-v")
    return out


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    problem = check_environment()
    if problem:
        print(f"error: {problem}", file=sys.stderr)
        return 2

    from pipeline import build, extract, ingest  # imported after the dependency check

    code = 0
    if not args.skip_download:
        ingest_argv = _common(args)
        if args.query:
            ingest_argv += ["--query", args.query]
        if args.ext:
            ingest_argv += ["--ext", *args.ext]
        if args.max_size_mb is not None:
            ingest_argv += ["--max-size-mb", str(args.max_size_mb)]
        if args.dry_run:
            ingest_argv.append("--dry-run")
        code = ingest.main(ingest_argv)
        if args.dry_run:
            return code
        if code:
            print("warning: some downloads failed (see log above); continuing with what is available", file=sys.stderr)

    if not args.skip_contract:
        build_argv = ["--config", args.config] if args.config else []
        if args.verbose:
            build_argv.append("-v")
        build_code = build.main(build_argv)
        if build_code:
            print("error: data/processed does not match the contract (see log above)", file=sys.stderr)
        code = build_code or code

    if not args.skip_documents:
        extract_argv = _common(args)
        if args.ext:
            extract_argv += ["--formats", *args.ext]
        if args.no_pdf_tables:
            extract_argv.append("--no-pdf-tables")
        code = extract.main(extract_argv) or code
    return code


if __name__ == "__main__":
    sys.exit(main())
