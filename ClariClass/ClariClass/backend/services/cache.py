from typing import Dict, Optional

# In-memory simplified chunk cache
# In production, can be backed by Redis
_simplified_chunk_cache: Dict[int, str] = {}

def get_cached_simplification(chunk_id: int) -> Optional[str]:
    return _simplified_chunk_cache.get(chunk_id)

def set_cached_simplification(chunk_id: int, simplified_text: str):
    _simplified_chunk_cache[chunk_id] = simplified_text

def clear_cache():
    _simplified_chunk_cache.clear()
