"""Compact views of Trek API responses, as the model sees them.

Kept small on purpose: everything here is sent to the model on every turn.
"""

from typing import Any

from .errors import Result

Data = dict[str, Any]


def user_context(me: Data, preferences: Data, travelers: list[Data]) -> Result:
    home = preferences.get("homeAirport") or {}
    return {
        "name": f"{me['firstName']} {me['lastName']}",
        "preferences": {
            "currency": preferences.get("currency"),
            "maxNightlyRate": preferences.get("maxNightlyRate"),
            "minHotelRating": preferences.get("minHotelRating"),
            "homeAirport": home.get("code"),
            "defaultTravelers": preferences.get("defaultTravelers"),
            "notes": preferences.get("notes"),
        },
        "travelers": [
            {
                "id": t["id"],
                "name": f"{t['firstName']} {t['lastName']}",
                "dateOfBirth": t.get("dateOfBirth"),
            }
            for t in travelers
        ],
    }


def destination(d: Data, airports: list[Data]) -> Result:
    return {
        "id": d["id"],
        "name": d["name"],
        "country": d["country"],
        "description": d.get("description"),
        "airports": [a["code"] for a in airports],
    }


def hotel(h: Data) -> Result:
    return {
        "id": h["id"],
        "name": h["name"],
        "address": h["address"],
        "rating": h.get("rating"),
        "nightlyRate": h["nightlyRate"],
        "currency": h["currency"],
        "availableRooms": h.get("availableRooms"),
    }


def flight(f: Data) -> Result:
    return {
        "id": f["id"],
        "flightNumber": f["flightNumber"],
        "airline": f["airline"],
        "from": f["departureAirport"]["code"],
        "to": f["arrivalAirport"]["code"],
        "departureAt": f["departureAt"],
        "arrivalAt": f["arrivalAt"],
        "price": f["price"],
        "currency": f["currency"],
        "availableSeats": f["availableSeats"],
    }


def trip_summary(t: Data) -> Result:
    return {
        "id": t["id"],
        "name": t["name"],
        "status": t["status"],
        "destination": t["destination"]["name"],
        "startDate": t["startDate"][:10],
        "endDate": t["endDate"][:10],
    }


def trip(t: Data) -> Result:
    return {
        "id": t["id"],
        "name": t["name"],
        "status": t["status"],
        "destination": (t.get("destination") or {}).get("name"),
        "startDate": t["startDate"][:10],
        "endDate": t["endDate"][:10],
        "hotelStays": [_trip_stay(s) for s in t.get("itineraryHotel", [])],
        "flights": [_trip_flight(f) for f in t.get("itineraryFlight", [])],
        "totals": t.get("totals"),
    }


def quote(q: Data) -> Result:
    return {
        "tripId": q["itineraryId"],
        "status": q["status"],
        "bookable": q["bookable"],
        "totals": q["totals"],
        "hotelStays": [
            {
                "itemId": s["itemId"],
                "hotel": s["hotelName"],
                "checkIn": s["checkInDate"],
                "checkOut": s["checkOutDate"],
                "rooms": s["rooms"],
                "totalPrice": s["totalPrice"],
                "currency": s["currency"],
                "priceChanged": s["priceChanged"],
            }
            for s in q["hotelStays"]
        ],
        "flights": [
            {
                "itemId": f["itemId"],
                "flight": f"{f['airline']} {f['flightNumber']}",
                "departureAt": f["departureAt"],
                "passengers": f["passengers"],
                "totalPrice": f["totalPrice"],
                "currency": f["currency"],
                "priceChanged": f["priceChanged"],
            }
            for f in q["flights"]
        ],
        "issues": q["issues"],
    }


def _trip_stay(s: Data) -> Result:
    return {
        "itemId": s["id"],
        "hotel": s["hotel"]["name"],
        "checkIn": s["checkInDate"][:10],
        "checkOut": s["checkOutDate"][:10],
        "rooms": s["rooms"],
        "totalPrice": s["totalPrice"],
        "currency": s["currency"],
    }


def _trip_flight(item: Data) -> Result:
    f = item["flight"]
    return {
        "itemId": item["id"],
        "flight": f"{f['airline']} {f['flightNumber']}",
        "route": f"{f['departureAirport']['code']}-{f['arrivalAirport']['code']}",
        "departureAt": f["departureAt"],
        "passengers": item["passengers"],
        "totalPrice": item["totalPrice"],
        "currency": item["currency"],
    }
