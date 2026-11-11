from typing import Any

import pytest

from trek_agent.assistant.tools import TOOLS


def test_has_no_tool_that_books_cancels_or_touches_the_account() -> None:
    forbidden = ("confirm", "cancel", "password", "account")
    names = {tool.__name__ for tool in TOOLS}

    assert not {n for n in names if any(word in n for word in forbidden)}


@pytest.mark.parametrize("tool", TOOLS, ids=lambda t: t.__name__)
def test_every_tool_is_documented(tool: Any) -> None:
    # The docstring is the tool description the model reads.
    assert tool.__doc__ and len(tool.__doc__.strip()) > 20
