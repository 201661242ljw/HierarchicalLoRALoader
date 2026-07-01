from __future__ import annotations

import json

import comfy.utils
import folder_paths
from aiohttp import web
from server import PromptServer

from .lora_parser import parse_lora_keys
from .strength_tree import (
    apply_local_strengths,
    build_strength_tree,
    collect_effective_strength_map,
    compute_effective_strengths,
)
from .weight_apply import apply_hierarchical_lora


def _build_lora_tree_payload(lora_name: str) -> dict:
    lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
    all_keys, _ = parse_lora_keys(lora_path)
    _, source_key_to_path = build_strength_tree(all_keys)
    return {
        "lora_name": lora_name,
        "all_keys_count": len(all_keys),
        "tree_paths": sorted(set(source_key_to_path.values())),
    }


@PromptServer.instance.routes.get("/hierarchical_lora_loader/tree")
async def get_hierarchical_lora_tree(request):
    lora_name = request.query.get("lora_name", "")
    if not lora_name:
        return web.json_response({"error": "Missing query param: lora_name"}, status=400)
    try:
        payload = _build_lora_tree_payload(lora_name)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
    return web.json_response(payload)


class HierarchicalLoraLoader:
    def __init__(self):
        self._cached_lora = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_name": (folder_paths.get_filename_list("loras"),),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01}),
                "tree_config_json": (
                    "STRING",
                    {
                        "default": "{}",
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    FUNCTION = "load_lora_tree"
    CATEGORY = "loaders"

    def _load_lora_state(self, lora_path: str, file_hash: str):
        if self._cached_lora is not None:
            cached_path, cached_hash, cached_state = self._cached_lora
            if cached_path == lora_path and cached_hash == file_hash:
                return cached_state

        lora_state = comfy.utils.load_torch_file(lora_path, safe_load=True)
        self._cached_lora = (lora_path, file_hash, lora_state)
        return lora_state

    @staticmethod
    def _flatten_tree_config(
        node,
        path_parts: list[str],
        out_strengths: dict[str, float],
        out_curves: dict[str, dict],
    ) -> None:
        if isinstance(node, (int, float)):
            if path_parts:
                out_strengths["/".join(path_parts)] = float(node)
            return

        if not isinstance(node, dict):
            return

        value = None
        for key in ("_value", "value", "strength"):
            if key in node and isinstance(node[key], (int, float)):
                value = float(node[key])
                break
        if value is not None and path_parts:
            out_strengths["/".join(path_parts)] = value

        curve = node.get("_curve")
        if isinstance(curve, dict) and path_parts:
            out_curves["/".join(path_parts)] = curve

        children_obj = node.get("children")
        if isinstance(children_obj, dict):
            for child_key, child_node in children_obj.items():
                HierarchicalLoraLoader._flatten_tree_config(
                    child_node,
                    [*path_parts, str(child_key).upper()],
                    out_strengths,
                    out_curves,
                )

        for child_key, child_node in node.items():
            if child_key in ("_value", "value", "strength", "children", "_curve"):
                continue
            HierarchicalLoraLoader._flatten_tree_config(
                child_node,
                [*path_parts, str(child_key).upper()],
                out_strengths,
                out_curves,
            )

    @staticmethod
    def _parse_tree_config(tree_config_json: str) -> tuple[dict[str, float], dict[str, dict]]:
        if not tree_config_json or not tree_config_json.strip():
            return {}, {}
        parsed = json.loads(tree_config_json)
        if not isinstance(parsed, dict):
            raise ValueError("tree_config_json must be a JSON object.")
        # Backward compatible:
        # 1) Flat path JSON: {"UNET/DOWN/BLOCK_0": 0.7}
        # 2) Hierarchical JSON: {"UNET": {"_value": 0.8, "DOWN": {"BLOCK_0": {"_value": 0.7}}}}
        if all(isinstance(v, (int, float)) for v in parsed.values()):
            return ({str(k): float(v) for k, v in parsed.items()}, {})

        out_strengths: dict[str, float] = {}
        out_curves: dict[str, dict] = {}
        for k, v in parsed.items():
            HierarchicalLoraLoader._flatten_tree_config(v, [str(k).upper()], out_strengths, out_curves)
        return out_strengths, out_curves

    def load_lora_tree(self, model, clip, lora_name, strength_model, strength_clip, tree_config_json):
        lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
        all_keys, file_hash = parse_lora_keys(lora_path)
        lora_state = self._load_lora_state(lora_path, file_hash)

        root, source_key_to_path = build_strength_tree(all_keys)
        local_strengths, curve_configs = self._parse_tree_config(tree_config_json)
        apply_local_strengths(root, local_strengths)
        compute_effective_strengths(root)
        path_to_effective = collect_effective_strength_map(root)

        model_lora, clip_lora = apply_hierarchical_lora(
            model=model,
            clip=clip,
            lora_state_dict=lora_state,
            strength_model=float(strength_model),
            strength_clip=float(strength_clip),
            source_key_to_path=source_key_to_path,
            path_to_effective=path_to_effective,
            path_to_curve_config=curve_configs,
        )

        preview_payload = {
            "lora": lora_name,
            "total_lora_keys": len(all_keys),
            "mapped_branches": len(path_to_effective),
            "effective_preview": dict(list(path_to_effective.items())[:128]),
        }
        return {"ui": {"tree_preview": [json.dumps(preview_payload, ensure_ascii=False)]}, "result": (model_lora, clip_lora)}


NODE_CLASS_MAPPINGS = {
    "HierarchicalLoraLoader": HierarchicalLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HierarchicalLoraLoader": "Hierarchical LoRA Loader",
}
