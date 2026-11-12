"""Demo requirement extractor (rule-based, deterministic).

This is NOT a language model. It is a transparent parser used when no AI provider is configured,
so the product works offline and every behaviour is reproducible. Its limits are measured in the
Evaluation Lab.

Contract (spec AC-01, §4.6): every extracted value carries the exact quote and the character offsets
in the source text, so ``text[start:end] == quote`` always holds. When nothing is found the field is
MISSING with no source — we never invent a span. Brief text is treated as untrusted data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .catalog import BY_KEY

EXTRACTOR_VERSION = "demo-rules-1.2"
# 1.2 (2026-11-12): revised against the dev split and held-out v1 failures only (see docs/eval/EVAL_V2_PROTOCOL.md):
# prose lead definitions, labelled numbers, k/rb/ribu and number-word budgets, N quarters, numbers inside the lead
# definition or a historical reference are criteria rather than campaign parameters, budget cues, a principled place
# list, and broader injection / claim / attach phrasing.


@dataclass
class Span:
    start: int
    end: int
    quote: str


@dataclass
class ExtractedField:
    key: str
    state: str  # DRAFT | MISSING | CONFLICTING
    value: str | None = None
    span: Span | None = None
    note: str | None = None
    candidates: list[dict] = field(default_factory=list)  # for CONFLICTING: [{value, span}]


@dataclass
class Flag:
    kind: str  # prompt_injection | unsupported_claim
    message: str
    span: Span


@dataclass
class ExtractionResult:
    extractor: str
    fields: dict[str, ExtractedField]
    flags: list[Flag]
    action_hints: list[str]


NUM = r"\d+(?:[.,]\d+)*"
_F = re.IGNORECASE


def _span(m: re.Match, group: int | str = 0) -> Span:
    return Span(m.start(group), m.end(group), m.group(group))


def _int_from(num: str) -> int | None:
    digits = num.replace(".", "").replace(",", "")
    return int(digits) if digits.isdigit() else None


def _amount_with_unit(num: str, unit: str | None) -> int | None:
    unit = (unit or "").lower()
    mult = {"juta": 10**6, "jt": 10**6, "million": 10**6, "mn": 10**6,
            "miliar": 10**9, "milyar": 10**9, "billion": 10**9, "m": 10**9}.get(unit)
    if mult is None:
        return _int_from(num)
    # with a unit word, a single [.,] followed by 1–2 digits is a decimal separator ("1,5 miliar")
    dm = re.fullmatch(r"(\d+)(?:[.,](\d{1,2}))?", num)
    if dm:
        whole, frac = dm.group(1), dm.group(2) or ""
        return int(whole) * mult + (int(frac.ljust(len(frac), "0")) * mult // (10 ** len(frac)) if frac else 0)
    base = _int_from(num)
    return base * mult if base is not None else None


def _resolve(key: str, found: list[tuple[str, Span]], note: str | None = None) -> ExtractedField:
    if not found:
        return ExtractedField(key, "MISSING", note="Not found in the brief.")
    distinct = {v for v, _ in found}
    if len(distinct) == 1:
        value, span = found[0]
        return ExtractedField(key, "DRAFT", value, span, note)
    seen: dict[str, Span] = {}
    for v, s in found:
        seen.setdefault(v, s)
    return ExtractedField(
        key, "CONFLICTING", None, None,
        f"The brief contains {len(seen)} different values. Ask the client which one applies.",
        [{"value": v, "span": s.__dict__} for v, s in seen.items()],
    )


_EN = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
       "seventeen eighteen nineteen")
EN_UNITS = {w: i for i, w in enumerate(_EN.split())}  # noqa: SIM905
EN_TENS = {w: 10 * (i + 2) for i, w in enumerate(["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"])}
ID_UNITS = {w: i + 1 for i, w in enumerate(["satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"])}
NUMBER_WORD = (r"(?:" + "|".join(list(EN_UNITS) + list(EN_TENS) + list(ID_UNITS)) +
               r"|hundred|thousand|and|sepuluh|sebelas|belas|puluh|ratus|seratus|ribu|seribu|a)")
WORDS_NUM = rf"(?:{NUMBER_WORD}(?:[\s-]+{NUMBER_WORD})*)"


def words_to_int(phrase: str) -> int | None:
    """Parse English or Indonesian number words ('three thousand', 'dua ribu lima ratus')."""
    tokens = [t for t in re.split(r"[\s-]+", phrase.lower()) if t and t not in ("and", "a")]
    total = current = 0
    i = 0
    seen = False
    while i < len(tokens):
        t = tokens[i]
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if t in EN_UNITS:
            current += EN_UNITS[t]
        elif t in EN_TENS:
            current += EN_TENS[t]
        elif t in ID_UNITS and nxt in ("belas", "puluh", "ratus", "ribu"):
            current += {"belas": ID_UNITS[t] + 10, "puluh": ID_UNITS[t] * 10, "ratus": ID_UNITS[t] * 100}.get(nxt, 0)
            if nxt == "ribu":
                total += (current + ID_UNITS[t]) * 1000
                current = 0
            i += 1
        elif t in ID_UNITS:
            current += ID_UNITS[t]
        elif t == "sepuluh":
            current += 10
        elif t == "sebelas":
            current += 11
        elif t == "seratus":
            current += 100
        elif t == "seribu":
            total += 1000
        elif t == "hundred":
            current = max(current, 1) * 100
        elif t in ("thousand", "ribu"):
            total += max(current, 1) * 1000
            current = 0
        else:
            return None
        seen = True
        i += 1
    n = total + current
    return n if seen and n > 0 else None


LEADS = (r"(?:qualified\s+|marketing[- ]qualified\s+|sales[- ]qualified\s+)?"
         r"(?:leads?\b|prospek\b|MQLs?\b|SQLs?\b)")
THOUSANDS = r"(?:k|rb|ribu|thousand)\b"
Region = tuple[int, int]


def _amount_k(num: str, unit: str | None) -> int | None:
    """'1.5k' / '3,5 ribu' → 1500 / 3500; a single [.,] + 1–2 digits before a thousands unit is a decimal."""
    if not unit:
        return _int_from(num)
    dm = re.fullmatch(r"(\d+)(?:[.,](\d{1,2}))?", num)
    if dm:
        whole, frac = dm.group(1), dm.group(2) or ""
        return int(whole) * 1000 + (int(frac) * 1000 // (10 ** len(frac)) if frac else 0)
    base = _int_from(num)
    return base * 1000 if base is not None else None


def _inside(span: Span, regions: list[Region]) -> bool:
    return any(a <= span.start < b for a, b in regions)


def _prefer_outside(found: list[tuple[str, Span]], regions: list[Region]) -> list[tuple[str, Span]]:
    """Numbers inside the lead definition or a historical/reference sentence are criteria, not campaign parameters.
    They are dropped when the brief also states the parameter elsewhere."""
    outside = [f for f in found if not _inside(f[1], regions)]
    return outside if outside else found


# A label at the start of a line ("Leads: 2,000", "| Leads required | 750 |", "Target lead: 1.800").
LEAD_LABEL = re.compile(
    r"^[ \t|•*\-]*(?:target(?:\s+(?:of\s+)?leads?)?|leads?(?:\s+(?:target|required))?|lead\s+target|target\s+lead"
    r"|jumlah\s+lead|qualified\s+leads)[ \t]*(?:[:：=|]|\.{2,})[ \t.]*(?P<v>[^\n|]+)",
    _F | re.MULTILINE,
)
RANGE = re.compile(rf"(?:between|antara)?\s*(?P<a>{NUM})\s*(?P<ua>{THOUSANDS})?\s*(?:and|dan|to|sampai|-|–|—)\s*"
                   rf"(?P<b>{NUM})\s*(?P<ub>{THOUSANDS})?", _F)


def _target_leads(text: str, criteria: list[Region]) -> ExtractedField:
    found: list[tuple[str, Span]] = []
    taken: list[Region] = []
    for m in LEAD_LABEL.finditer(text):  # labelled value, possibly a range
        v, off = m.group("v"), m.start("v")
        r = RANGE.match(v.strip())
        if r and r.end() > 0 and re.match(r"\s*(?:leads?|prospek)?\s*$", v.strip()[r.end():], _F):
            lead = off + (len(v) - len(v.lstrip()))
            for g, u in (("a", "ua"), ("b", "ub")):
                n = _amount_k(r.group(g), r.group(u))
                if n:
                    s, e = lead + r.start(g), lead + r.end(g)
                    found.append((str(n), Span(s, e, text[s:e])))
            taken.append((m.start(), m.end()))
            continue
        nm = re.match(rf"\s*(?P<n>{NUM})\s*(?P<u>{THOUSANDS})?", v, _F)
        if nm:
            n = _amount_k(nm.group("n"), nm.group("u"))
            if n:
                s, e = off + nm.start("n"), off + nm.end()
                found.append((str(n), Span(s, e, text[s:e])))
                taken.append((m.start(), m.end()))
    rng = re.compile(rf"(?:between|antara)\s+(?P<a>{NUM})\s+(?:and|dan|to|sampai)\s+(?P<b>{NUM})\s*{LEADS}"
                     rf"|(?P<c>{NUM})\s*(?:-|–|to|sampai)\s*(?P<d>{NUM})\s*{LEADS}", _F)
    for m in rng.finditer(text):  # a range is ambiguous: surface both ends as a conflict
        if _inside(_span(m), taken):
            continue
        for g in (("a", "b") if m.group("a") else ("c", "d")):
            n = _int_from(m.group(g))
            if n:
                found.append((str(n), _span(m, g)))
        taken.append((m.start(), m.end()))
    pat = re.compile(rf"(?P<n>{NUM})\s*(?P<u>{THOUSANDS})?\s*{LEADS}", _F)
    for m in pat.finditer(text):
        if _inside(_span(m), taken):
            continue
        n = _amount_k(m.group("n"), m.group("u"))
        if n and n > 0:
            found.append((str(n), _span(m)))
    words = re.compile(rf"\b(?P<w>{WORDS_NUM})\s+{LEADS}", _F)
    for m in words.finditer(text):
        if _inside(_span(m), taken) or text[: m.start()].rstrip()[-1:].isdigit():  # "3,5 ribu leads"
            continue
        n = words_to_int(m.group("w"))
        if n:
            found.append((str(n), _span(m)))
    return _resolve("target_leads", _prefer_outside(found, criteria))


BUDGET_CUE = re.compile(
    r"(?:budget|anggaran|dana|spend|commit|set aside|approved|plafon|cap|ceiling|all[- ]in|total|biaya)", _F)
NOT_BUDGET_BEFORE = re.compile(
    r"(?:above|over|more than|at least|minimum|min\.|minimal|di atas|lebih dari|revenue|omzet|bill|tagihan"
    r"|purchases|turnover|spending)\W*$", _F)
NOT_BUDGET_AFTER = re.compile(r"^\s*(?:/|per\b|a (?:year|month)|(?:in|of) (?:closed )?revenue|pendapatan)", _F)


def _budget(text: str, criteria: list[Region]) -> ExtractedField:
    pat = re.compile(
        rf"(?:Rp\.?|IDR)\s?(?P<n>{NUM})(?:\s*(?P<u>juta|jt|million|mn|miliar|milyar|billion|M\b))?", _F
    )
    cued, plain = [], []
    for m in pat.finditer(text):
        tail = text[m.end(): m.end() + 24]
        head = text[max(0, m.start() - 24): m.start()]
        if NOT_BUDGET_AFTER.match(tail) or NOT_BUDGET_BEFORE.search(head):  # rate, threshold or revenue
            continue
        unit = m.group("u")
        if unit and unit.lower() == "m":  # "IDR 60M" is millions; "Rp1,2M" is miliar (Indonesian usage)
            whole = _int_from(re.sub(r"[.,]\d{1,2}$", "", m.group("n"))) or 0
            unit = "million" if whole >= 10 else "miliar"
        amount = _amount_with_unit(m.group("n"), unit)
        if amount and amount > 0:
            ctx = text[max(0, m.start() - 40): m.end() + 16]
            (cued if BUDGET_CUE.search(ctx) else plain).append((str(amount), _span(m)))
    words = re.compile(rf"\b(?P<w>{WORDS_NUM})\s+(?P<u>million|juta|billion|miliar)\s+(?:rupiah|IDR)\b", _F)
    for m in words.finditer(text):
        n = words_to_int(m.group("w"))
        if n:
            mult = 10**6 if m.group("u").lower() in ("million", "juta") else 10**9
            ctx = text[max(0, m.start() - 40): m.end() + 16]
            (cued if BUDGET_CUE.search(ctx) else plain).append((str(n * mult), _span(m)))
    found = _prefer_outside(cued, criteria) if cued else _prefer_outside(plain, criteria)
    return _resolve("budget", found)


def _timeline(text: str, criteria: list[Region]) -> ExtractedField:
    pat = re.compile(rf"(?P<n>\d{{1,3}}|{WORDS_NUM})\s*-?\s*(?P<u>weeks?|wks?|minggu|months?|bulan|days?|hari)\b",
                     _F)
    found, notes = [], set()
    for m in pat.finditer(text):
        raw = m.group("n")
        n = int(raw) if raw.isdigit() else words_to_int(raw)
        if not n:
            continue
        unit = m.group("u").lower()
        if unit.startswith(("month", "bulan")):
            weeks = n * 4
            notes.add("Months converted to weeks at 4 weeks per month (demo assumption).")
        elif unit.startswith(("day", "hari")):
            weeks = -(-n // 7)
            notes.add("Days converted to whole weeks, rounded up (demo assumption).")
        else:
            weeks = n
        found.append((str(weeks), _span(m)))
    q = re.compile(r"\b(?P<n>one|a|1|satu|two|2|dua|three|3|tiga|four|4|empat)\s+(?:quarters?|kuartal)\b", _F)
    for m in q.finditer(text):
        n = {"one": 1, "a": 1, "satu": 1, "two": 2, "dua": 2, "three": 3, "tiga": 3, "four": 4, "empat": 4}.get(
            m.group("n").lower()) or int(m.group("n"))
        found.append((str(13 * n), _span(m)))
        notes.add("Quarters converted to 13 weeks each (demo assumption).")
    return _resolve("timeline", _prefer_outside(found, criteria), " ".join(sorted(notes)) or None)


OPEN_VALUE = re.compile(
    r"^(?:(?:tbd|tbc|open)\b.*|n/?a|-+|to be (?:determined|confirmed|decided|agreed|finali[sz]ed|discussed|defined)\b.*"
    r"|not (?:yet )?(?:defined|decided|confirmed)\b.*|belum\b.*|akan dikonfirmasi.*|unknown)\.?$", _F,
)

LABELS = {
    "lead_definition": r"qualified lead definition|lead definition|definisi (?:qualified )?lead(?: berkualitas)?"
                       r"|lead criteria|mql criteria|kriteria lead|qualified lead|qualification(?: rule)?",
    "geography": r"geography|geografi|target geography|region|wilayah|target market|lokasi|area|cakupan wilayah",
    "target_segment": r"target segment|segment|industry|industri|target industry|target audience",
    "reporting": r"reporting|pelaporan|laporan",
    "deliverables": r"deliverables?|channels?|kanal|scope|lingkup",
    "start_date": r"start date|start|kick-?off(?: date)?|tanggal mulai|mulai",
    "constraints": r"constraints?|exclusions?|batasan|pengecualian|restrictions?",
}

# Place list rule (1.2): countries/regions as before; all 38 Indonesian provinces (incl. common abbreviations);
# every provincial capital; Indonesian cities above ~1 million people; and places that appear in the dev split or
# held-out v1. Nothing was added from held-out v2.
PLACES = (
    r"Indonesia|Malaysia|Singapore|Singapura|Vietnam|Thailand|Philippines|Filipina|Brunei|Australia|New Zealand|Japan|"
    r"India|APAC|ASEAN|Southeast Asia|Asia Tenggara|Manila|Cebu|Kuala Lumpur|Bangkok|"
    # provinces / islands
    r"Aceh|Sumatra|Sumatera|Riau|Kepulauan Riau|Kepri|Jambi|Bengkulu|Lampung|Bangka Belitung|Babel|Banten|DKI|Java|"
    r"Jawa|DIY|Yogyakarta|Jogja|Bali|NTB|NTT|Nusa Tenggara|Kalimantan|Sulawesi|Gorontalo|Maluku|Papua|"
    # provincial capitals
    r"Banda Aceh|Medan|Padang|Pekanbaru|Tanjung Pinang|Palembang|Bandar Lampung|Pangkal Pinang|Jakarta|Serang|"
    r"Bandung|Semarang|Surabaya|Denpasar|Mataram|Kupang|Pontianak|Palangka Raya|Banjarmasin|Banjarbaru|Samarinda|"
    r"Tanjung Selor|Manado|Palu|Makassar|Kendari|Mamuju|Ambon|Sofifi|Jayapura|Manokwari|Sorong|Merauke|Nabire|"
    r"Wamena|"
    # cities above ~1 million
    r"Bekasi|Tangerang|Depok|Bogor|Batam|Jabodetabek|"
    # seen in dev / held-out v1
    r"Cikarang|Karawang|Purwakarta|Sidoarjo|Balikpapan"
)
GEO_PHRASE = re.compile(rf"\b(?:{PLACES})\b(?:\s*(?:,|and|dan|&|\+|or|atau)\s*\b(?:{PLACES})\b)*", re.IGNORECASE)
GEO_CUE = re.compile(r"\b(?:target\w*|focus\w*|in|di|across|wilayah|region|market|pasar|area|located|based|lokasi"
                     r"|from|dari|among|throughout|seluruh"
                     r"|leads?|prospek)\b", re.IGNORECASE)  # "wants 3,000 leads, …, Surabaya + Sidoarjo"


def _geography(text: str) -> ExtractedField:
    f = _labelled(text, "geography")
    if f.state != "MISSING" or f.span is not None:
        return f
    for sentence in re.finditer(r"[^.\n]+", text):  # unlabelled: a place name in a targeting sentence
        s = sentence.group(0)
        for m in GEO_PHRASE.finditer(s):
            if GEO_CUE.search(s[: m.start()]):
                start = sentence.start() + m.start()
                quote = m.group(0)
                return ExtractedField("geography", "DRAFT", quote, Span(start, start + len(quote), quote),
                                      "Found in a sentence without a label; confirm it is the target geography.")
    return f


# Prose lead definitions (1.2). The labelled form ("Lead definition: …") is still tried first.
DEF_CUE = re.compile(
    r"\b(?:a |an |the |each |every )?(?:qualified |valid )?(?:lead|SQL|MQL|prospect)s?\s+"
    r"(?:is|are|means|counts?|qualif(?:y|ies)|must be|should be)\b(?!\s*\d)"
    r"|\bqualified\s*(?:=|:|when\b|if\b|means\b)"
    r"|\bconsider\s+(?:a |the )?(?:lead|prospect)s?\s+(?:as\s+)?(?:qualified|valid)"
    r"|\b(?:lead(?:nya)?|prospek)\s*="
    r"|\b(?:lead|leads|prospek)(?:\s+yang)?\s+(?:dihitung|dianggap|valid|memenuhi syarat|berkualitas|kami hitung)\b"
    r"|\b(?:yang )?(?:kami )?(?:hitung|anggap)\s+(?:sebagai\s+)?(?:lead|prospek)\b"
    r"|\bdihitung\s+(?:sebagai\s+lead\s+)?(?:bila|kalau|jika|apabila)\b"
    r"|\bkriteria(?:nya|\s+lead)?\s*[:=]",
    _F,
)
SENTENCE_END = re.compile(r"\.(?=\s|$)|\n[ \t]*\n|\n[ \t]*[-•*|]|\n[ \t]*\d+\.\s|\n(?=[A-Z][\w ]{0,30}[:|])")


def _sentence_end(text: str, pos: int) -> int:
    m = SENTENCE_END.search(text, pos)
    return m.start() if m else len(text)


def _lead_definition(text: str) -> tuple[ExtractedField, list[Region]]:
    f = _labelled(text, "lead_definition")
    if f.state == "DRAFT" and f.span:
        return f, [(f.span.start, _sentence_end(text, f.span.end))]
    if f.span is not None:  # labelled but still open ("to be agreed")
        return f, []
    m = DEF_CUE.search(text)
    if not m:
        return f, []
    end = _sentence_end(text, m.end())
    quote = text[m.start():end].rstrip()
    span = Span(m.start(), m.start() + len(quote), quote)
    return (ExtractedField("lead_definition", "DRAFT", quote, span,
                           "Found as a sentence without a label; confirm this is the full qualification rule."),
            [(span.start, span.end)])


HISTORICAL = re.compile(r"\b(?:last year|previous campaign|tahun lalu|sebelumnya|for reference)\b", _F)


def _criteria_regions(text: str, definition: list[Region]) -> list[Region]:
    """The lead definition plus any historical/reference sentence, from the cue to the end of its sentence."""
    return definition + [(m.start(), _sentence_end(text, m.end())) for m in HISTORICAL.finditer(text)]


def _start_date(text: str) -> ExtractedField:
    from .catalog import parse_date

    f = _labelled(text, "start_date")
    if f.state != "DRAFT":
        return f
    iso = parse_date(f.value or "")
    if iso is None:
        return ExtractedField("start_date", "MISSING", None, f.span,
                              "A start is mentioned but not as a recognisable date; confirm with the client.")
    f.value = iso
    return f


def _labelled(text: str, key: str) -> ExtractedField:
    # 1.2: table rows ("| Qualification rule | … |") use "|" as the separator
    pat = re.compile(rf"^[ \t\-•*|]*(?:{LABELS[key]})[ \t]*[:：|][ \t]*(?P<v>[^\n|]+?)[ \t|]*$",
                     _F | re.MULTILINE)
    m = pat.search(text)
    if not m:
        return ExtractedField(key, "MISSING", note="Not found in the brief.")
    value = m.group("v").strip()
    span = _span(m, "v")
    if OPEN_VALUE.match(value):
        return ExtractedField(key, "MISSING", None, span, "The brief says this is still open.")
    return ExtractedField(key, "DRAFT", value, span)


def _reporting(text: str) -> ExtractedField:
    f = _labelled(text, "reporting")
    if f.state != "MISSING" or f.span is not None:
        return f
    m = re.search(r"[^.\n]*\b(?:dashboard|CRM)\b[^.\n]*", text, _F)
    if m:
        quote = m.group(0).strip()
        start = m.start() + m.group(0).index(quote)
        return ExtractedField("reporting", "DRAFT", quote, Span(start, start + len(quote), quote),
                              "Taken from a sentence that mentions dashboard/CRM; confirm wording.")
    return f


INJECTION = re.compile(
    r"ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:the )?(?:rules|instructions)"
    r"|abaikan (?:semua )?instruksi|system prompt|you are now"
    r"|approve (?:this |it |the )?(?:proposal |request |offer )?(?:now|immediately)"
    r"|langsung setujui|auto-?approve"
    # 1.2: rule-override and approval-bypass phrasing seen in held-out v1
    r"|\bignore\s+(?:\w+\s+){0,4}?(?:rules|instructions|guidelines|checks)\b"
    r"|\babaikan\s+(?:\w+\s+){0,3}?(?:aturan|instruksi|validasi)\b"
    r"|\bmark\s+(?:this|it)\b[^.\n]{0,25}\bas\s+approved\b"
    r"|\b(?:act|acting|bertindak)\s+(?:as|sebagai)\s+(?:the\s+)?approver\b"
    r"|\b(?:skip|bypass|lewati)\s+(?:the\s+|proses\s+)?(?:human\s+)?review\b"
    r"|\b(?:note|catatan|pesan)\s+(?:to|untuk)\s+(?:the\s+)?(?:AI|sistem|system|model)\b",
    _F,
)
CLAIM = re.compile(
    r"guarantee(?:d|s)?\b[^.\n]*|dijamin[^.\n]*|menjamin[^.\n]*"
    r"|\bpasti\s+(?:menghasilkan|mendapat|mengembalikan)[^.\n]*"
    r"|\d+(?:[.,]\d+)?\s*x\s*(?:ROI|return)|ROI (?:of )?\d+\s*%|\d+\s*%\s*ROI"
    r"|(?:returned|returns?|delivered|generated|menghasilkan)\b[^.\n]{0,30}?\b(?:\d+|two|three|four|five|six|seven|"
    r"eight|nine|ten|dua|tiga|empat|lima)\s*(?:x|times|kali)\b[^.\n]*"
    # 1.2: payback and projected-revenue phrasing seen in held-out v1
    r"|\b(?:\w+\s+)?kali lipat\b[^.\n]*|\bpays?\s+for\s+itself\b[^.\n]*|\btimes over\b"
    r"|\bwill\s+(?:generate|deliver|bring(?: in)?|produce|return)\b[^.]{0,40}?\b(?:revenue|sales|ROI|profit)\b[^.\n]*",
    _F,
)
SPEC_DOC = (r"(?:spec(?:ification)?s?|spec\s+sheet|scope(?:\s+(?:doc\w*|document|of work))|dokumen\s+"
            r"(?:spesifikasi\w*|ruang lingkup|scope)|spesifikasi\w*|SOW|statement of work|requirements?\s+doc\w*)")
ATTACH_VERB = (r"(?:attach|lampirkan|lampiran|include|file[ds]?|upload|unggah|diunggah|link|sertakan|simpan|put"
               r"|tambahkan)")
ATTACH_SPEC = re.compile(
    rf"\b{ATTACH_VERB}\b[^.]{{0,60}}\b{SPEC_DOC}\b|\b{SPEC_DOC}\b[^.]{{0,60}}\b{ATTACH_VERB}\b", _F
)


def scan_flags(text: str) -> list[Flag]:
    flags = [Flag("prompt_injection",
                  "Instruction-like text found in the brief. It is treated as data and grants no permissions.",
                  _span(m)) for m in INJECTION.finditer(text)]
    flags += [Flag("unsupported_claim",
                   "Outcome claim without supporting data. Shown as a client claim, never as a fact.",
                   _span(m)) for m in CLAIM.finditer(text)]
    return flags


def plan_actions(text: str) -> list[str]:
    actions = ["crm.create_opportunity", "tracker.create_project"]
    if ATTACH_SPEC.search(text):
        actions.append("tracker.attach_spec")
    return actions


def extract(text: str) -> ExtractionResult:
    lead_definition, definition_region = _lead_definition(text)
    criteria = _criteria_regions(text, definition_region)
    fields = {
        "target_leads": _target_leads(text, criteria),
        "budget": _budget(text, criteria),
        "timeline": _timeline(text, criteria),
        "lead_definition": lead_definition,
        "geography": _geography(text),
        "target_segment": _labelled(text, "target_segment"),
        "deliverables": _labelled(text, "deliverables"),
        "start_date": _start_date(text),
        "constraints": _labelled(text, "constraints"),
        "reporting": _reporting(text),
    }
    assert set(fields) == set(BY_KEY)
    return ExtractionResult(EXTRACTOR_VERSION, fields, scan_flags(text), plan_actions(text))
