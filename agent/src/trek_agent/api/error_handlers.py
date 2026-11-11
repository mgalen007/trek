"""The one place domain errors become HTTP responses.

Every error leaves as `{"error": {"code", "message"}}`, the same shape as the
Trek API's errors, so clients branch on `error.code`. Routers never build
error responses themselves.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from ..core.errors import AppError


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, err: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=err.status_code,
            content={"error": {"code": err.code, "message": err.message}},
        )
