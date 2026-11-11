from dataclasses import dataclass
from datetime import date

from ..clients.trek import TrekClient


@dataclass
class TrekDeps:
    """What every tool gets: a Trek client acting as the user, and today's date."""

    client: TrekClient
    today: date
