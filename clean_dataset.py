#!/usr/bin/env python3
"""
Clean and normalize a tourism dataset for the travel planner.

The script:
- safely loads dataset.json and repairs common JSON formatting issues
- normalizes titles for comparison
- filters invalid or low-quality entries
- deduplicates by normalized title or rounded coordinates
- writes cleaned_dataset.json as a pretty JSON array
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


VALID_CATEGORIES = {
    "nature",
    "entertainment",
    "heritage",
    "culture",
    "shopping",
    "food",
    "family",
    "events",
}
GENERIC_TITLE_TERMS = {"unknown", "mystery", "test"}
REDUNDANT_TITLE_WORDS = {
    "restaurant",
    "cafe",
    "coffee",
    "roastery",
    "shop",
    "mall",
    "park",
    "museum",
}
MIN_RATING = 4.0
MAX_RATING = 5.0
RIYADH_LAT_RANGE = (24.0, 26.0)
RIYADH_LON_RANGE = (45.0, 47.5)


def find_dataset_file() -> Path:
    """Locate dataset.json without changing the project structure."""
    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / "dataset.json",
        base_dir / "data" / "dataset.json",
    ]

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    raise FileNotFoundError("dataset.json was not found in the project root or data directory.")


def load_text(path: Path) -> str:
    """Read the raw dataset text safely."""
    return path.read_text(encoding="utf-8-sig")


def repair_json_text(raw_text: str) -> str:
    """Repair common formatting issues in a messy JSON file."""
    text = raw_text.strip()
    if not text:
        raise ValueError("dataset.json is empty.")

    # Fix adjacent objects missing commas, both inside and outside arrays.
    text = re.sub(r"}\s*{", "},{", text)
    # Remove trailing commas before array/object close.
    text = re.sub(r",\s*([}\]])", r"\1", text)

    if text.startswith("{") and text.endswith("}"):
        text = f"[{text}]"

    return text


def load_dataset(path: Path) -> List[Dict[str, Any]]:
    """Load and validate the source dataset."""
    raw_text = load_text(path)
    repaired_text = repair_json_text(raw_text)

    try:
        data = json.loads(repaired_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Unable to parse dataset.json after repair: {exc}") from exc

    if not isinstance(data, list):
        raise ValueError("dataset.json must contain a JSON array or a sequence of objects.")

    return [item for item in data if isinstance(item, dict)]


def collapse_duplicate_words(words: Iterable[str]) -> List[str]:
    """Remove repeated adjacent words used for normalization."""
    result: List[str] = []
    previous: Optional[str] = None

    for word in words:
        if word == previous:
            continue
        result.append(word)
        previous = word

    return result


def normalize_title_for_match(title: Any) -> str:
    """Create a stable title key for duplicate detection."""
    if not isinstance(title, str):
        return ""

    lowered = title.strip().lower()
    cleaned = re.sub(r"[^\w\s]", " ", lowered)
    words = [word for word in cleaned.split() if word]
    words = collapse_duplicate_words(words)

    normalized_words: List[str] = []
    seen_redundant = set()
    for word in words:
        if word in REDUNDANT_TITLE_WORDS:
            if word in seen_redundant:
                continue
            seen_redundant.add(word)
        normalized_words.append(word)

    return " ".join(normalized_words)


def title_is_generic(title: Any) -> bool:
    """Reject obviously fake or placeholder records."""
    normalized = normalize_title_for_match(title)
    if not normalized:
        return True
    return any(term in normalized for term in GENERIC_TITLE_TERMS)


def parse_float(value: Any) -> Optional[float]:
    """Convert supported values to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def valid_coordinate_range(latitude: float, longitude: float) -> bool:
    """Validate that a place lies within the approximate Riyadh region."""
    return (
        RIYADH_LAT_RANGE[0] <= latitude <= RIYADH_LAT_RANGE[1]
        and RIYADH_LON_RANGE[0] <= longitude <= RIYADH_LON_RANGE[1]
    )


def coordinate_key(latitude: float, longitude: float) -> Tuple[float, float]:
    """Round coordinates to reduce noisy duplicates."""
    return (round(latitude, 4), round(longitude, 4))


def build_clean_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate and normalize one item while preserving the original title format."""
    title = item.get("title")
    category = item.get("category")
    rating = parse_float(item.get("rating"))
    latitude = parse_float(item.get("latitude"))
    longitude = parse_float(item.get("longitude"))

    if not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(category, str):
        return None

    category_clean = category.strip().lower()
    if category_clean not in VALID_CATEGORIES:
        return None
    if rating is None or not (MIN_RATING <= rating <= MAX_RATING):
        return None
    if latitude is None or longitude is None:
        return None
    if not valid_coordinate_range(latitude, longitude):
        return None
    if title_is_generic(title):
        return None

    return {
        "title": title.strip(),
        "category": category_clean,
        "rating": round(rating, 1),
        "latitude": latitude,
        "longitude": longitude,
        "_title_key": normalize_title_for_match(title),
        "_coord_key": coordinate_key(latitude, longitude),
    }


def choose_better_item(current: Dict[str, Any], candidate: Dict[str, Any]) -> Dict[str, Any]:
    """Keep the highest-rated duplicate, then prefer the more descriptive title."""
    if candidate["rating"] > current["rating"]:
        return candidate
    if candidate["rating"] < current["rating"]:
        return current

    current_title_len = len(current["title"].strip())
    candidate_title_len = len(candidate["title"].strip())
    if candidate_title_len > current_title_len:
        return candidate
    return current


def deduplicate_items(items: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """Remove duplicates by normalized title or rounded coordinates."""
    kept_items: List[Dict[str, Any]] = []
    index_by_title: Dict[str, int] = {}
    index_by_coord: Dict[Tuple[float, float], int] = {}
    removed_duplicates = 0

    for item in items:
        title_key = item["_title_key"]
        coord_key = item["_coord_key"]

        existing_index = None
        if title_key and title_key in index_by_title:
            existing_index = index_by_title[title_key]
        elif coord_key in index_by_coord:
            existing_index = index_by_coord[coord_key]

        if existing_index is None:
            kept_items.append(item)
            new_index = len(kept_items) - 1
            if title_key:
                index_by_title[title_key] = new_index
            index_by_coord[coord_key] = new_index
            continue

        removed_duplicates += 1
        best_item = choose_better_item(kept_items[existing_index], item)
        kept_items[existing_index] = best_item

        best_title_key = best_item["_title_key"]
        best_coord_key = best_item["_coord_key"]
        if best_title_key:
            index_by_title[best_title_key] = existing_index
        index_by_coord[best_coord_key] = existing_index

    for item in kept_items:
        item.pop("_title_key", None)
        item.pop("_coord_key", None)

    return kept_items, removed_duplicates


def write_output(path: Path, items: List[Dict[str, Any]]) -> None:
    """Write the cleaned dataset as pretty JSON."""
    path.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    try:
        dataset_path = find_dataset_file()
        raw_items = load_dataset(dataset_path)
        total_original = len(raw_items)

        cleaned_candidates: List[Dict[str, Any]] = []
        filtered_items = 0

        for item in raw_items:
            cleaned_item = build_clean_item(item)
            if cleaned_item is None:
                filtered_items += 1
                continue
            cleaned_candidates.append(cleaned_item)

        deduplicated_items, removed_duplicates = deduplicate_items(cleaned_candidates)
        output_path = Path(__file__).resolve().parent / "cleaned_dataset.json"
        write_output(output_path, deduplicated_items)

        print(f"Total original count: {total_original}")
        print(f"Final cleaned count: {len(deduplicated_items)}")
        print(f"Number of removed duplicates: {removed_duplicates}")
        print(f"Number of filtered items: {filtered_items}")
        return 0

    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
