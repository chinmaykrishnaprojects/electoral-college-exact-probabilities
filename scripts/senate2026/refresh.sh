#!/usr/bin/env bash
# Re-pull Kalshi and rebuild src/senate/data.json. Run from repo root.
set -e
cd "$(dirname "$0")"
export PYTHONIOENCODING=utf-8
rm -rf data/cache
python pull_open.py > /dev/null
python pull_history.py > /dev/null
python fit.py > /dev/null
python pairs.py > /dev/null
python timeseries.py > /dev/null
[ -f data/calibration.json ] || python calibration.py > /dev/null
python build_data.py ../../src/senate/data.json
