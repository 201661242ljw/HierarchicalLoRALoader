from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Iterable

from safetensors import safe_open


_KNOWN_SUFFIXES = (
    ".lora_linear_layer.up.weight",
    ".lora_linear_layer.down.weight",
    ".lora_up.weight",
    ".lora_down.weight",
    "_lora.up.weight",
    "_lora.down.weight",
    ".lora_B.weight",
    ".lora_A.weight",
    ".lora.up.weight",
    ".lora.down.weight",
    ".lora_B",
    ".lora_A",
    ".lora_mid.weight",
    ".hada_w1_a",
    ".hada_w1_b",
    ".hada_w2_a",
    ".hada_w2_b",
    ".hada_t1",
    ".hada_t2",
    ".lokr_w1",
    ".lokr_w2",
    ".lokr_w1_a",
    ".lokr_w1_b",
    ".lokr_w2_a",
    ".lokr_w2_b",
    ".lokr_t2",
    ".a1.weight",
    ".a2.weight",
    ".b1.weight",
    ".b2.weight",
    ".w_norm",
    ".b_norm",
    ".diff_b",
    ".diff",
    ".set_weight",
    ".reshape_weight",
    ".dora_scale",
    ".alpha",
)


def compute_file_hash(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            block = f.read(1024 * 1024)
            if not block:
                break
            hasher.update(block)
    return hasher.hexdigest()


@lru_cache(maxsize=32)
def _read_safetensor_keys_cached(file_path: str, file_hash: str) -> tuple[str, ...]:
    _ = file_hash
    with safe_open(file_path, framework="pt", device="cpu") as sf:
        return tuple(sf.keys())


def parse_lora_keys(file_path: str) -> tuple[list[str], str]:
    file_hash = compute_file_hash(file_path)
    return list(_read_safetensor_keys_cached(file_path, file_hash)), file_hash


def extract_base_lora_key(full_key: str) -> str:
    for suffix in _KNOWN_SUFFIXES:
        if full_key.endswith(suffix):
            return full_key[: -len(suffix)]
    return full_key


def collect_base_lora_keys(all_keys: Iterable[str]) -> list[str]:
    return sorted({extract_base_lora_key(k) for k in all_keys})
