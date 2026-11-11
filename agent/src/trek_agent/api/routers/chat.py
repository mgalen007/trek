from fastapi import APIRouter

from ..dependencies import ChatServiceDep
from ..schemas import ChatRequest, ChatResponse, ErrorResponse

router = APIRouter(tags=["chat"])


@router.post(
    "/chat",
    responses={
        401: {"model": ErrorResponse, "description": "Missing, expired or invalid agent token"},
        404: {"model": ErrorResponse, "description": "Unknown conversation, or another user's"},
        422: {"description": "Invalid message, or the assistant needed too many steps"},
        502: {"model": ErrorResponse, "description": "Unexpected Trek API error"},
    },
)
async def chat(body: ChatRequest, service: ChatServiceDep) -> ChatResponse:
    """Send the user's message; returns the assistant's reply."""
    result = await service.chat(body.message, body.conversation_id)
    return ChatResponse(conversation_id=result.conversation_id, reply=result.reply)
