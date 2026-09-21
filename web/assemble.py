"""Assemble the page from the files in this folder.

`linked` writes index.html plus the css, js and a data.js next to it.
`inline` returns one self-contained HTML string.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

WEB = Path(__file__).parent
SCRIPTS = ["util.js", "tango/solver.js", "queens/solver.js", "common.js", "tango/engine.js", "queens/engine.js", "tango/generator.js", "queens/generator.js", "worker.js", "app.js"]


def data_script(data: dict) -> str:
    return "window.PUZZLE_DATA = " + json.dumps(data, separators=(",", ":")).replace("</", "<\\/") + ";"


def inline(data: dict) -> str:
    html = (WEB / "index.html").read_text()
    styles = "<style>\n" + (WEB / "styles.css").read_text() + "</style>"
    scripts = "<script>" + data_script(data) + "</script>\n" + "\n".join(
        "<script>\n" + (WEB / name).read_text() + "</script>" for name in SCRIPTS
    )
    return html.replace("<!-- STYLES -->", styles).replace("<!-- SCRIPTS -->", scripts)


def linked(data: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    html = (WEB / "index.html").read_text()
    styles = '<link rel="stylesheet" href="styles.css">'
    scripts = '<script src="data.js"></script>\n' + "\n".join(f'<script src="{name}"></script>' for name in SCRIPTS)
    (out_dir / "index.html").write_text(html.replace("<!-- STYLES -->", styles).replace("<!-- SCRIPTS -->", scripts))
    (out_dir / "data.js").write_text(data_script(data))
    for name in ["styles.css", *SCRIPTS]:
        (out_dir / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(WEB / name, out_dir / name)
    return out_dir / "index.html"
