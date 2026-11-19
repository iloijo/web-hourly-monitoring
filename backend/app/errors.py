"""Error text that is safe to send to the browser.

Validation errors raised on purpose (ValueError, LookupError, PermissionError and the app's own
AuthError / OverrideError / Forbidden) carry a message written for the user, so it is shown as is.
Anything else (psycopg2, OS, bugs) may contain host names, table names or SQL: it is written to the
server log with a short reference and the browser only gets that reference.
"""
import logging
import secrets

logger = logging.getLogger("netpulse.errors")

# Exception class names (not imports, to avoid circular imports) whose message is meant for the user
_USER_FACING = {"AuthError", "OverrideError", "Forbidden"}


def public_error(e: BaseException) -> str:
    if isinstance(e, (ValueError, LookupError, PermissionError)) or type(e).__name__ in _USER_FACING:
        return str(e)
    ref = secrets.token_hex(3)
    logger.error("[ref %s] %s: %s", ref, type(e).__name__, e, exc_info=e)
    return f"Terjadi kesalahan server/database (ref {ref}). Detail ada di log server."
