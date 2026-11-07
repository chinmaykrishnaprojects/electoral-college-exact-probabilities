#!/usr/bin/env bash
# Re-pull Kalshi and rebuild src/senate/data.json (Senate, House, governors, cross-chamber). Run from anywhere.
set -e
cd "$(dirname "$0")"
export PYTHONIOENCODING=utf-8
rm -rf data/cache
python pull_open.py > /dev/null
python pull_history.py > /dev/null
python pull_house_gov.py --fresh > /dev/null
python pull_history2.py > /dev/null
python fit.py > /dev/null
python pairs.py > /dev/null
python timeseries.py > /dev/null
python fit_all.py > /dev/null
python fit_house.py > /dev/null
[ -f data/calibration.json ] || python calibration.py > /dev/null
python build_data.py ../../src/senate/data.json

# 2026 results retrospective (settled markets + daily history -> src/senate/retro.json)
python scripts/senate2026/pull_results.py
python scripts/senate2026/retro.py src/senate/retro.json
