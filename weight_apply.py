from __future__ import annotations

import math

import comfy.hooks
import comfy.lora
import comfy.lora_convert


CURVE_SAMPLE_COUNT = 33


def _build_key_maps(model, clip) -> tuple[dict[str, str], dict[str, str]]:
    model_key_map = {}
    clip_key_map = {}
    if model is not None:
        model_key_map = comfy.lora.model_lora_keys_unet(model.model, model_key_map)
    if clip is not None:
        clip_key_map = comfy.lora.model_lora_keys_clip(clip.cond_stage_model, clip_key_map)
    return model_key_map, clip_key_map


def _build_target_strength_map(
    key_map: dict[str, str],
    source_key_to_path: dict[str, str],
    path_to_effective: dict[str, float],
) -> dict[str, float]:
    target_to_strength: dict[str, float] = {}
    for source_key, target_key in key_map.items():
        path = source_key_to_path.get(source_key)
        if path is None:
            continue
        target_to_strength[target_key] = path_to_effective.get(path, 1.0)
    return target_to_strength


def _has_dynamic_curve(path_to_curve_config: dict[str, dict]) -> bool:
    for cfg in path_to_curve_config.values():
        if isinstance(cfg, dict) and cfg.get("enabled"):
            return True
    return False


def _curve_multiplier(curve_cfg: dict | None, percent: float) -> float:
    if not isinstance(curve_cfg, dict) or not curve_cfg.get("enabled"):
        return 1.0

    points = curve_cfg.get("points")
    if isinstance(points, list) and len(points) > 0:
        normalized = []
        for point in points:
            if not isinstance(point, dict):
                continue
            x = point.get("x")
            y = point.get("y")
            try:
                normalized.append((float(x), float(y)))
            except (TypeError, ValueError):
                continue
        normalized.sort(key=lambda item: item[0])
        if not normalized:
            return 1.0
        if percent < normalized[0][0] or percent > normalized[-1][0]:
            return 0.0
        if percent <= normalized[0][0]:
            return normalized[0][1]
        if percent >= normalized[-1][0]:
            return normalized[-1][1]
        for index in range(len(normalized) - 1):
            p1 = normalized[index]
            p2 = normalized[index + 1]
            if percent >= p1[0] and percent <= p2[0]:
                span = p2[0] - p1[0]
                if span == 0:
                    return p1[1]
                local_t = (percent - p1[0]) / span
                return p1[1] * (1.0 - local_t) + p2[1] * local_t
        return 0.0

    mode = str(curve_cfg.get("mode", "linear")).lower()
    start_percent = float(curve_cfg.get("start_percent", 0.0))
    end_percent = float(curve_cfg.get("end_percent", 1.0))
    start_mult = float(curve_cfg.get("start_multiplier", 1.0))
    end_mult = float(curve_cfg.get("end_multiplier", 1.0))

    if end_percent <= start_percent:
        return end_mult if percent >= end_percent else start_mult
    if percent <= start_percent:
        return start_mult
    if percent >= end_percent:
        return end_mult

    t = (percent - start_percent) / (end_percent - start_percent)
    if mode == "step":
        shaped = 0.0 if t < 0.5 else 1.0
    elif mode == "ease_in":
        shaped = t * t
    elif mode == "ease_out":
        shaped = 1.0 - ((1.0 - t) * (1.0 - t))
    elif mode == "ease_in_out":
        shaped = 0.5 * (1.0 - math.cos(math.pi * t))
    else:
        shaped = t
    return start_mult + ((end_mult - start_mult) * shaped)


def _build_effective_curve_samples(
    path_to_effective: dict[str, float],
    path_to_curve_config: dict[str, dict],
) -> dict[str, list[tuple[float, float]]]:
    percents = [i / (CURVE_SAMPLE_COUNT - 1) for i in range(CURVE_SAMPLE_COUNT)]
    path_to_samples: dict[str, list[tuple[float, float]]] = {}

    for path, base_effective in path_to_effective.items():
        parts = path.split("/")
        ancestors = ["/".join(parts[: i + 1]) for i in range(len(parts))]
        samples: list[tuple[float, float]] = []
        for percent in percents:
            mult = 1.0
            for ancestor in ancestors:
                mult *= _curve_multiplier(path_to_curve_config.get(ancestor), percent)
            samples.append((percent, base_effective * mult))
        path_to_samples[path] = samples
    return path_to_samples


def _compress_curve_samples(samples: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not samples:
        return []
    compressed = [samples[0]]
    for percent, strength in samples[1:]:
        if not math.isclose(strength, compressed[-1][1], rel_tol=1e-6, abs_tol=1e-6):
            compressed.append((percent, strength))
    if compressed[-1][0] < 1.0:
        compressed.append((1.0, compressed[-1][1]))
    return compressed


def _build_dynamic_hooks(
    model,
    clip,
    lora_state_dict: dict,
    strength_model: float,
    strength_clip: float,
    source_key_to_path: dict[str, str],
    path_to_effective: dict[str, float],
    path_to_curve_config: dict[str, dict],
):
    converted_lora = comfy.lora_convert.convert_lora(lora_state_dict)
    model_key_map, clip_key_map = _build_key_maps(model, clip)

    model_loaded = comfy.lora.load_lora(converted_lora, model_key_map, log_missing=False) if model is not None else {}
    clip_loaded = comfy.lora.load_lora(converted_lora, clip_key_map, log_missing=False) if clip is not None else {}

    path_model_patches: dict[str, dict] = {}
    path_clip_patches: dict[str, dict] = {}

    for source_key, target_key in model_key_map.items():
        path = source_key_to_path.get(source_key)
        if path is None or target_key not in model_loaded:
            continue
        path_model_patches.setdefault(path, {})[target_key] = model_loaded[target_key]

    for source_key, target_key in clip_key_map.items():
        path = source_key_to_path.get(source_key)
        if path is None or target_key not in clip_loaded:
            continue
        path_clip_patches.setdefault(path, {})[target_key] = clip_loaded[target_key]

    model_hook_group = comfy.hooks.HookGroup()
    clip_hook_group = comfy.hooks.HookGroup()
    path_to_samples = _build_effective_curve_samples(path_to_effective, path_to_curve_config)

    all_paths = sorted(set(path_model_patches.keys()) | set(path_clip_patches.keys()))
    for path in all_paths:
        model_patches = path_model_patches.get(path)
        clip_patches = path_clip_patches.get(path)
        if not model_patches and not clip_patches:
            continue

        def make_keyframes():
            keyframes = comfy.hooks.HookKeyframeGroup()
            compressed = _compress_curve_samples(path_to_samples.get(path, [(0.0, 1.0), (1.0, 1.0)]))
            is_first = True
            for percent, eff_strength in compressed:
                guarantee_steps = 1 if is_first else 0
                is_first = False
                keyframes.add(
                    comfy.hooks.HookKeyframe(
                        strength=float(eff_strength),
                        start_percent=float(percent),
                        guarantee_steps=guarantee_steps,
                    )
                )
            return keyframes

        if model_patches:
            hook_model = comfy.hooks.WeightHook(strength_model=strength_model, strength_clip=0.0)
            hook_model.weights = model_patches
            hook_model.weights_clip = None
            hook_model.need_weight_init = False
            hook_model.hook_keyframe = make_keyframes()
            model_hook_group.add(hook_model)

        if clip_patches:
            hook_clip = comfy.hooks.WeightHook(strength_model=0.0, strength_clip=strength_clip)
            hook_clip.weights = None
            hook_clip.weights_clip = clip_patches
            hook_clip.need_weight_init = False
            hook_clip.hook_keyframe = make_keyframes()
            clip_hook_group.add(hook_clip)

    model_out = model.clone() if model is not None else None
    clip_out = clip.clone() if clip is not None else None

    if model_out is not None and len(model_hook_group) > 0:
        model_out.register_all_hook_patches(
            model_hook_group,
            comfy.hooks.create_target_dict(comfy.hooks.EnumWeightTarget.Model),
        )

    if clip_out is not None:
        if len(model_hook_group) > 0:
            clip_out.apply_hooks_to_conds = model_hook_group.clone()
        if len(clip_hook_group) > 0:
            clip_out.patcher.forced_hooks = clip_hook_group.clone()
            clip_out.use_clip_schedule = True
            clip_out.patcher.register_all_hook_patches(
                clip_out.patcher.forced_hooks,
                comfy.hooks.create_target_dict(comfy.hooks.EnumWeightTarget.Clip),
            )

    return model_out, clip_out


def _apply_static_hierarchical_lora(
    model,
    clip,
    lora_state_dict: dict,
    strength_model: float,
    strength_clip: float,
    source_key_to_path: dict[str, str],
    path_to_effective: dict[str, float],
):
    if strength_model == 0 and strength_clip == 0:
        return model, clip

    model_key_map, clip_key_map = _build_key_maps(model, clip)
    converted_lora = comfy.lora_convert.convert_lora(lora_state_dict)
    model_loaded = comfy.lora.load_lora(converted_lora, model_key_map, log_missing=False) if model is not None else {}
    clip_loaded = comfy.lora.load_lora(converted_lora, clip_key_map, log_missing=False) if clip is not None else {}

    model_target_to_strength = _build_target_strength_map(model_key_map, source_key_to_path, path_to_effective)
    clip_target_to_strength = _build_target_strength_map(clip_key_map, source_key_to_path, path_to_effective)

    model_out = model.clone() if model is not None else None
    clip_out = clip.clone() if clip is not None else None

    if model_out is not None and strength_model != 0:
        for target_key, patch_value in model_loaded.items():
            effective = model_target_to_strength.get(target_key, 1.0)
            model_out.add_patches({target_key: patch_value}, strength_model * effective)

    if clip_out is not None and strength_clip != 0:
        for target_key, patch_value in clip_loaded.items():
            effective = clip_target_to_strength.get(target_key, 1.0)
            clip_out.add_patches({target_key: patch_value}, strength_clip * effective)

    return model_out, clip_out


def apply_hierarchical_lora(
    model,
    clip,
    lora_state_dict: dict,
    strength_model: float,
    strength_clip: float,
    source_key_to_path: dict[str, str],
    path_to_effective: dict[str, float],
    path_to_curve_config: dict[str, dict] | None = None,
):
    path_to_curve_config = path_to_curve_config or {}
    if _has_dynamic_curve(path_to_curve_config):
        return _build_dynamic_hooks(
            model=model,
            clip=clip,
            lora_state_dict=lora_state_dict,
            strength_model=strength_model,
            strength_clip=strength_clip,
            source_key_to_path=source_key_to_path,
            path_to_effective=path_to_effective,
            path_to_curve_config=path_to_curve_config,
        )

    return _apply_static_hierarchical_lora(
        model=model,
        clip=clip,
        lora_state_dict=lora_state_dict,
        strength_model=strength_model,
        strength_clip=strength_clip,
        source_key_to_path=source_key_to_path,
        path_to_effective=path_to_effective,
    )
