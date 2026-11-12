from typing import Annotated

from fastapi import APIRouter, Body

from ..dependencies import ChatServiceDep
from ..schemas import ChatRequest, ChatResponse, ErrorResponse

router = APIRouter(tags=["chat"])

# Without these, the docs pre-fill `"conversation_id": "string"`, which isn't
# a conversation (404) and hides that leaving it out starts a new one.
CHAT_EXAMPLES = {
    "start": {
        "summary": "Start a conversation",
        "description": "No `conversation_id`: a new conversation begins.",
        "value": {"message": "Plan 3 nights in Nairobi next month, flying from Kigali"},
    },
    "continue": {
        "summary": "Continue a conversation",
        "description": "Send the `conversation_id` from the previous reply.",
        "value": {
            "message": "Make it 4 nights, and a cheaper hotel",
            "conversation_id": "the conversation_id from the previous reply",
        },
    },
}


@router.post(
    "/chat",
    responses={
        401: {"model": ErrorResponse, "description": "Missing, expired or invalid agent token"},
        404: {"model": ErrorResponse, "description": "Unknown conversation, or another user's"},
        422: {"description": "Invalid message, or the assistant needed too many steps"},
        502: {"model": ErrorResponse, "description": "Unexpected Trek API error"},
    },
)
async def chat(
    body: Annotated[ChatRequest, Body(openapi_examples=CHAT_EXAMPLES)],
    service: ChatServiceDep,
) -> ChatResponse:
    """Send the user's message; returns the assistant's reply.

    Leave out `conversation_id` to start a new conversation; send the one from
    the reply to continue it.
    """
    result = await service.chat(body.message, body.conversation_id)
    return ChatResponse(conversation_id=result.conversation_id, reply=result.reply)
