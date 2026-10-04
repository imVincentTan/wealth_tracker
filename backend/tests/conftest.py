"""Point the app at throwaway locations before anything imports `app`.

Must run before test modules import `app.config` (which snapshots settings):
the SQLite database and the raw-CSV archive land in a temp dir instead of
backend/data/.
"""

import os
import tempfile

_TMP_DATA_DIR = tempfile.mkdtemp(prefix="tally-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP_DATA_DIR}/tally.db")
os.environ.setdefault("DATA_DIR", _TMP_DATA_DIR)
