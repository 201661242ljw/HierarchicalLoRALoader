from __future__ import annotations

import re
from dataclasses import dataclass, field

from .lora_parser import collect_base_lora_keys


@dataclass
class TreeNode:
    name: str
    children: dict[str, "TreeNode"] = field(default_factory=dict)
    local_strength: float = 1.0
    effective_strength: float = 1.0

    def get_or_create_path(self, parts: list[str]) -> "TreeNode":
        node = self
        for part in parts:
            if part not in node.children:
                node.children[part] = TreeNode(name=part)
            node = node.children[part]
        return node


def _tokenize(body: str) -> list[str]:
    return [t for t in re.split(r"[._]+", body) if t]


def _normalize_tree_parts(tokens: list[str], root_name: str) -> list[str]:
    out = [root_name]
    i = 0
    while i < len(tokens):
        token = tokens[i].lower()
        nxt = tokens[i + 1] if i + 1 < len(tokens) else None

        if token in ("down", "downblocks", "down_blocks"):
            out.append("DOWN")
        elif token in ("up", "upblocks", "up_blocks"):
            out.append("UP")
        elif token in ("mid", "midblock", "mid_block", "middle", "middle_block"):
            out.append("MID")
        elif token in ("block", "blocks", "downblock", "upblock"):
            if nxt and nxt.isdigit():
                out.append(f"BLOCK_{nxt}")
                i += 1
            else:
                out.append("BLOCK")
        elif token in ("layer", "layers"):
            if nxt and nxt.isdigit():
                out.append(f"LAYER_{nxt}")
                i += 1
            else:
                out.append("LAYER")
        elif token in ("attention", "attentions", "attn", "attn1", "attn2"):
            out.append("ATTENTION")
        elif token in ("transformer", "transformerblocks", "transformer_blocks"):
            out.append("TRANSFORMER")
        elif token in ("text", "textmodel", "text_model"):
            out.append("TEXT_MODEL")
        elif token == "encoder":
            out.append("ENCODER")
        elif token == "decoder":
            out.append("DECODER")
        elif token == "self":
            if nxt and nxt.lower() == "attn":
                out.append("SELF_ATTN")
                i += 1
            else:
                out.append("SELF")
        elif token.startswith("to"):
            out.append(token.upper())
        elif token.isdigit():
            out.append(f"IDX_{token}")
        else:
            out.append(token.upper())
        i += 1

    compacted: list[str] = []
    for part in out:
        if not compacted or compacted[-1] != part:
            compacted.append(part)
    return compacted


def key_to_tree_path(base_key: str) -> str:
    if base_key.startswith("lora_unet_"):
        root = "UNET"
        body = base_key[len("lora_unet_") :]
    elif base_key.startswith("diffusion_model."):
        root = "UNET"
        body = base_key[len("diffusion_model.") :]
    elif base_key.startswith("unet."):
        root = "UNET"
        body = base_key[len("unet.") :]
    elif base_key.startswith("lora_te"):
        root = "TEXT_ENCODER"
        body = base_key
    elif base_key.startswith("text_encoder"):
        root = "TEXT_ENCODER"
        body = base_key
    elif base_key.startswith("text_encoders."):
        root = "TEXT_ENCODER"
        body = base_key[len("text_encoders.") :]
    else:
        root = "OTHER"
        body = base_key

    parts = _normalize_tree_parts(_tokenize(body), root)
    return "/".join(parts)


def canonicalize_path(path: str) -> str:
    return "/".join([p.strip().upper() for p in path.split("/") if p.strip()])


def build_strength_tree(all_keys: list[str]) -> tuple[TreeNode, dict[str, str]]:
    root = TreeNode(name="ROOT")
    key_to_path: dict[str, str] = {}
    for base_key in collect_base_lora_keys(all_keys):
        path = key_to_tree_path(base_key)
        key_to_path[base_key] = path
        root.get_or_create_path(path.split("/"))
    return root, key_to_path


def apply_local_strengths(root: TreeNode, path_to_local_strength: dict[str, float]) -> None:
    for raw_path, local_strength in path_to_local_strength.items():
        path = canonicalize_path(raw_path)
        if not path:
            continue
        node = root.get_or_create_path(path.split("/"))
        node.local_strength = float(local_strength)


def compute_effective_strengths(root: TreeNode) -> None:
    def dfs(node: TreeNode, parent_effective: float) -> None:
        node.effective_strength = parent_effective * node.local_strength
        for child in node.children.values():
            dfs(child, node.effective_strength)

    for child in root.children.values():
        dfs(child, 1.0)


def collect_effective_strength_map(root: TreeNode) -> dict[str, float]:
    path_to_effective: dict[str, float] = {}

    def walk(node: TreeNode, path_parts: list[str]) -> None:
        if path_parts:
            path_to_effective["/".join(path_parts)] = node.effective_strength
        for name, child in node.children.items():
            walk(child, [*path_parts, name])

    for name, child in root.children.items():
        walk(child, [name])
    return path_to_effective
