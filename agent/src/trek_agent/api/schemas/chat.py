from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    # Omit to start a new conversation; send the returned id to continue it.
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
