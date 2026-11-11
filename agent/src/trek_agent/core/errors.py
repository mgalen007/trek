"""Domain errors, raised by services. No web framework here: the API layer
turns them into responses (api/error_handlers.py), using `status_code` and
`code`."""


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "Something went wrong"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message


class MissingAgentToken(AppError):
    status_code = 401
    code = "MISSING_AGENT_TOKEN"
    message = "Send the user's agent token as a Bearer token"


class InvalidAgentToken(AppError):
    status_code = 401
    code = "INVALID_AGENT_TOKEN"
    message = "Agent token rejected; get a new one"


class ConversationNotFound(AppError):
    status_code = 404
    code = "CONVERSATION_NOT_FOUND"
    message = "Conversation not found"


class StepLimitReached(AppError):
    status_code = 422
    code = "STEP_LIMIT_REACHED"
    message = "The assistant needed too many steps; try a more specific request"


class TrekUnavailable(AppError):
    status_code = 502
    code = "TREK_ERROR"
    message = "The Trek API answered with an unexpected error"
