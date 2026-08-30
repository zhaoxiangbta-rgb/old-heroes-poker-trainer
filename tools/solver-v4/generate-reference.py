"""Development-only generator for the pinned Solver V4 reference corpus.

The installed trainer never imports this file or Python. Run it from a checkout
of amaster97/poker_solver 1.11.0 with that package installed.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="tools/solver-v4/reference-spots.json")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    defaults = config["defaults"]

    for spot in config["spots"]:
        output = output_dir / f"{spot['id']}.json"
        command = [
            sys.executable, "-m", "poker_solver.cli", "subgame",
            "--street", spot.get("street", defaults["street"]),
            "--board", spot["board"],
            "--hero", spot["hero"],
            "--villain-range", spot["villainRange"],
            "--iters", str(spot.get("iterations", defaults["iterations"])),
            "--pot", str(spot.get("potBb", defaults["potBb"])),
            "--stack", str(spot.get("stackBb", defaults["stackBb"])),
            "--walk-tree", "--format", "json", "--legacy-blueprint",
        ]
        with output.open("w", encoding="utf-8") as handle:
            subprocess.run(command, check=True, stdout=handle)
        print(f"generated {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
