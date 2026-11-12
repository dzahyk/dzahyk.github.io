"""Requirement catalogue for the Deal Desk domain (spec OD-01).

Each key defines what the extractor looks for, its value type, and whether it is critical.
Critical requirements must be CONFIRMED before a decision package can be frozen (spec BR-001, AC-02).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RequirementDef:
    key: str
    label: str
    value_type: str  # integer | idr | weeks | text | date
    critical: bool
    question: str  # default clarification question when the value is missing


CATALOG: tuple[RequirementDef, ...] = (
    RequirementDef("target_leads", "Target (qualified leads)", "integer", True,
                   "How many qualified leads should the campaign deliver?"),
    RequirementDef("budget", "Budget / proposed fee", "idr", True,
                   "What is the total budget available for this campaign?"),
    RequirementDef("timeline", "Timeline", "weeks", True,
                   "What is the campaign duration from kickoff?"),
    RequirementDef("lead_definition", "Qualified lead definition", "text", True,
                   "What criteria must a lead meet to be accepted as qualified?"),
    RequirementDef("geography", "Geography", "text", True,
                   "Which countries or regions should the campaign target?"),
    RequirementDef("target_segment", "Target segment", "text", False,
                   "Which industries or company sizes should be targeted?"),
    RequirementDef("deliverables", "Deliverables & channels", "text", False,
                   "Which deliverables and channels are in scope (e.g. LinkedIn, webinar, telemarketing)?"),
    RequirementDef("start_date", "Start date", "date", False,
                   "When should the campaign start?"),
    RequirementDef("constraints", "Constraints & exclusions", "text", False,
                   "Are there constraints or exclusions (e.g. excluded accounts, compliance limits)?"),
    RequirementDef("reporting", "Reporting & CRM sync", "text", False,
                   "What reporting cadence and CRM sync does the client expect?"),
)

BY_KEY = {d.key: d for d in CATALOG}
CRITICAL_KEYS = tuple(d.key for d in CATALOG if d.critical)

STATES = ("DRAFT", "CONFIRMED", "MISSING", "CONFLICTING", "NOT_APPLICABLE")


MONTHS = {
    "jan": 1, "january": 1, "januari": 1, "feb": 2, "february": 2, "februari": 2, "mar": 3, "march": 3, "maret": 3,
    "apr": 4, "april": 4, "may": 5, "mei": 5, "jun": 6, "june": 6, "juni": 6, "jul": 7, "july": 7, "juli": 7,
    "aug": 8, "august": 8, "agu": 8, "agustus": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10,
    "okt": 10, "oktober": 10, "nov": 11, "november": 11, "dec": 12, "december": 12, "des": 12, "desember": 12,
}


def parse_date(raw: str) -> str | None:
    """Return ISO yyyy-mm-dd for '2026-12-01', '1 Dec 2026', '1 Desember 2026' or '01/12/2026' (day first)."""
    import re
    from datetime import date

    t = raw.strip().rstrip(".").lower()
    try:
        if m := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", t):
            y, mo, d = map(int, m.groups())
        elif m := re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", t):
            d, mo, y = map(int, m.groups())
        elif m := re.fullmatch(r"(\d{1,2})\s+([a-z]+)\s+(\d{4})", t):
            d, mo, y = int(m.group(1)), MONTHS.get(m.group(2)), int(m.group(3))
            if mo is None:
                return None
        else:
            return None
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def normalize_value(value_type: str, raw: str | int | None) -> str | None:
    """Normalise a user-entered value. Raises ValueError with a helpful message."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise ValueError("A value is required.")
    if value_type in ("integer", "idr", "weeks"):
        s = str(raw).strip().replace("Rp", "").replace("IDR", "").replace(".", "").replace(",", "")
        s = s.replace(" ", "")
        if not s.isdigit():
            raise ValueError("Enter a whole number without decimals (e.g. 3000).")
        n = int(s)
        if n <= 0:
            raise ValueError("The value must be greater than zero.")
        if value_type == "weeks" and n > 520:
            raise ValueError("Timeline must be 520 weeks or less.")
        return str(n)
    if value_type == "date":
        iso = parse_date(str(raw))
        if iso is None:
            raise ValueError("Enter a date like 2026-12-01 or 1 Dec 2026.")
        return iso
    text = str(raw).strip()
    if len(text) > 1000:
        raise ValueError("Keep the value under 1,000 characters.")
    return text
