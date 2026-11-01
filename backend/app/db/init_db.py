"""Database bootstrap helpers.

The schema is owned by Alembic. On startup the application applies every pending
migration (``AUTO_MIGRATE=true`` by default) so a fresh database and a database
from an older release both end up on the current schema.

Deployments that run migrations as a separate step can set ``AUTO_MIGRATE=false``;
in that case the application only verifies that the database is reachable.
"""
from __future__ import annotations

import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.config import BACKEND_DIR, settings
from app.db.session import engine

logger = logging.getLogger(__name__)


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str((BACKEND_DIR / "migrations").resolve()))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    config.attributes["skip_logging"] = True
    return config


def init_db() -> None:
    """Apply pending migrations and log the resulting schema."""
    settings.ensure_directories()
    if settings.auto_migrate:
        command.upgrade(_alembic_config(), "head")
    else:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        logger.info("AUTO_MIGRATE=false - assuming migrations were applied externally")

    inspector = inspect(engine)
    logger.info("Database ready. Tables: %s", ", ".join(inspector.get_table_names()))


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    init_db()
