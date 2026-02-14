from __future__ import annotations

import re


def sanitize_item_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    cleaned = re.sub(r"[^A-Za-z0-9 ]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.title()
