from __future__ import annotations

from base64 import b64encode
from typing import Optional


def build_avatar_data_url(blob: Optional[bytes], content_type: Optional[str]) -> Optional[str]:
    if not blob or not content_type:
        return None
    encoded = b64encode(blob).decode("ascii")
    return f"data:{content_type};base64,{encoded}"
