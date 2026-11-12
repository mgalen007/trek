from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=4000,
        description="What the user says to the assistant.",
    )
    conversation_id: str | None = Field(
        default=None,
        description=(
            "Leave out (or send null) to start a new conversation. To continue one, "
            "send the `conversation_id` from the previous reply."
        ),
    )


class ChatResponse(BaseModel):
    conversation_id: str = Field(
        description="Send this back with the next message to continue the conversation."
    )
    reply: str = Field(description="The assistant's answer.")


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
