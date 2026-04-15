from __future__ import annotations

from . import core as _core
from . import routes as _routes

# Re-export all core symbols so existing imports from app.main keep working.
globals().update({name: value for name, value in _core.__dict__.items() if not name.startswith("__")})
