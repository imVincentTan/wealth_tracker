"""On-disk archive of each import's original CSV.

Every committed import is written to ``<data_dir>/raw/<account-slug>/<import-id>-<safe-filename>``
so the raw statements survive database resets: the SQLite file and the archive
live side by side under ``backend/data/``, but wiping the DB never touches the
archive. The database stays the source of truth — a failed archive write is
logged and skipped, never surfaced as an import error.
"""

import logging
import re
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Slug and filename only ever contain these, so the composed relative path can
# never contain a path separator (and therefore never traverses out of the
# archive root).
_SLUG_SAFE = re.compile(r"[^a-z0-9]+")
_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]")
_MAX_FILENAME_LEN = 120


def account_slug(name: str) -> str:
    slug = _SLUG_SAFE.sub("-", name.lower()).strip("-")
    return slug or "account"


def safe_filename(filename: str) -> str:
    # Drop any directory components (uploads can carry junk like "../x.csv"
    # or "C:\foo\bar.csv"), then strip everything but a conservative set.
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = _FILENAME_SAFE.sub("_", name).strip("._")
    if not cleaned:
        cleaned = "upload.csv"
    if len(cleaned) > _MAX_FILENAME_LEN:
        stem, dot, ext = cleaned.rpartition(".")
        if dot and len(ext) < _MAX_FILENAME_LEN:
            cleaned = stem[: _MAX_FILENAME_LEN - len(ext) - 1] + "." + ext
        else:
            cleaned = cleaned[:_MAX_FILENAME_LEN]
    return cleaned


def raw_file_relpath(account_name: str, import_id: int, filename: str) -> str:
    """Archive path relative to the data dir, e.g. ``raw/td-checking/12-statement.csv``."""
    return f"raw/{account_slug(account_name)}/{import_id}-{safe_filename(filename)}"


def move_archive_dir(old_account_name: str, new_account_name: str) -> None:
    """Keep the archive aligned after a rename by moving the account's directory.

    Files are named by import id, so merging into an existing directory (two
    accounts converging on the same slug) can't collide. A missing directory is
    a no-op; failures are logged and skipped — the archive is a convenience,
    never a source of truth.
    """
    old_slug = account_slug(old_account_name)
    new_slug = account_slug(new_account_name)
    if old_slug == new_slug:
        return
    root = Path(settings.data_dir) / "raw"
    old_dir = root / old_slug
    new_dir = root / new_slug
    if not old_dir.is_dir():
        return
    try:
        if not new_dir.is_dir():
            old_dir.rename(new_dir)
            return
        for f in old_dir.iterdir():
            if f.is_file():
                f.replace(new_dir / f.name)
        old_dir.rmdir()
    except OSError as exc:
        logger.warning("Could not move raw archive %s -> %s: %s", old_dir, new_dir, exc)


def write_raw_csv(account_name: str, import_id: int, filename: str, content: str) -> str | None:
    """Write the import's raw CSV to the archive; return the relative path or None."""
    relpath = raw_file_relpath(account_name, import_id, filename)
    path = _resolve_in_archive(relpath)
    if path is None:
        logger.warning("Refusing to write raw CSV outside archive for import %s", import_id)
        return None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    except OSError as exc:
        # The DB is the source of truth; a failed archive write must not fail
        # an import that already committed.
        logger.warning("Could not archive raw CSV for import %s: %s", import_id, exc)
        return None
    return relpath


def _resolve_in_archive(relpath: str) -> Path | None:
    archive_root = Path(settings.data_dir).resolve()
    path = (archive_root / relpath).resolve()
    if path != archive_root and archive_root not in path.parents:
        return None
    return path
