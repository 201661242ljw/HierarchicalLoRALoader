Hierarchical LoRA Loader for ComfyUI
A ComfyUI custom node for loading a LoRA with hierarchical block-level strength control.
Instead of applying one global LoRA strength to the whole model, this node reads the LoRA weight keys, maps them into a hierarchical tree such as `UNET / DOWN / BLOCK_x / ...` and `TEXT_ENCODER / ...`, and lets you adjust the strength of different branches independently.
It also supports optional step curves, so a block can use different LoRA multipliers at different sampling progress positions.
---
Features
Load a LoRA into both `MODEL` and `CLIP` like a normal LoRA loader.
Automatically parse LoRA keys from `.safetensors` files.
Build a readable block tree from LoRA key names.
Control LoRA strength by branch, block, layer, attention module, or other parsed path.
Parent-child strength inheritance: child effective strength is multiplied by all ancestor strengths.
Built-in visual block editor in the ComfyUI frontend.
Optional per-block step curve / sampling-progress curve.
Supports both flat JSON and hierarchical JSON configuration.
Keeps the raw JSON config hidden by default while exposing a visual editor.
---
Installation
Clone this repository into your ComfyUI `custom_nodes` directory:
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/201661242ljw/HierarchicalLoRALoader.git
```
Restart ComfyUI.
After restarting, the node should appear as:
```text
loaders / Hierarchical LoRA Loader
```
---
Usage
Add Hierarchical LoRA Loader to your workflow.
Connect `MODEL` and `CLIP` inputs.
Select a LoRA from the `lora_name` dropdown.
Set global strengths:
`strength_model`: global multiplier for UNet/model LoRA patches.
`strength_clip`: global multiplier for CLIP/text-encoder LoRA patches.
Click Open Block Editor.
Adjust strengths for different branches.
Click Apply.
The node outputs the patched `MODEL` and `CLIP`.
---
Strength Logic
The final strength applied to a LoRA patch is approximately:
```text
final_strength = global_strength × effective_block_strength × curve_multiplier
```
Where:
```text
effective_block_strength = parent_strength_1 × parent_strength_2 × ... × local_block_strength
```
For example, if:
```text
UNET = 0.8
UNET/DOWN = 0.5
UNET/DOWN/BLOCK_0 = 1.2
```
Then the effective strength for `UNET/DOWN/BLOCK_0` is:
```text
0.8 × 0.5 × 1.2 = 0.48
```
If `strength_model = 1.0`, the final model LoRA strength for that block is `0.48`.
---
Visual Block Editor
The frontend editor provides:
Expand / collapse tree branches.
Slider and numeric input for each block.
Effective strength preview.
Reset all overrides.
Per-block curve editor.
The editor writes its result into the hidden `tree_config_json` field.
You normally do not need to edit the JSON manually, but manual editing is supported.
---
JSON Config Format
Flat path format
```json
{
  "UNET/DOWN/BLOCK_0": 0.7,
  "UNET/MID": 1.2,
  "TEXT_ENCODER": 0.5
}
```
Hierarchical format
```json
{
  "UNET": {
    "_value": 0.8,
    "DOWN": {
      "_value": 0.6,
      "BLOCK_0": {
        "_value": 1.2
      }
    },
    "MID": {
      "_value": 1.1
    }
  },
  "TEXT_ENCODER": {
    "_value": 0.5
  }
}
```
The following keys are recognized as local strength values:
```text
_value
value
strength
```
Paths are normalized to uppercase internally.
---
Step Curve / Sampling Progress Curve
A block can also define a `_curve` field.
The curve uses points where:
`x` is sampling progress from `0.0` to `1.0`.
`y` is the multiplier at that progress.
Example:
```json
{
  "UNET": {
    "DOWN": {
      "BLOCK_0": {
        "_value": 1.0,
        "_curve": {
          "enabled": true,
          "points": [
            { "x": 0.0, "y": 0.0 },
            { "x": 0.4, "y": 1.0 },
            { "x": 1.0, "y": 0.5 }
          ]
        }
      }
    }
  }
}
```
This means the LoRA effect for `UNET/DOWN/BLOCK_0` starts at `0`, rises to `1.0` around 40% sampling progress, and ends at `0.5`.
When no curve is enabled, the node uses static LoRA patch application. When at least one curve is enabled, it uses ComfyUI hook keyframes for dynamic strength scheduling.
---
Parsed Tree Groups
The parser tries to map common LoRA key patterns into readable groups, including:
```text
UNET
TEXT_ENCODER
OTHER
DOWN
UP
MID
BLOCK_x
LAYER_x
ATTENTION
TRANSFORMER
SELF_ATTN
TO_Q / TO_K / TO_V / TO_OUT
```
Unrecognized parts are still preserved as uppercase path components, so the node can still expose them in the tree.
---
Notes on LoRA Compatibility
This node reads LoRA keys from `.safetensors` files and then relies on ComfyUI's internal LoRA conversion/loading logic.
The key parser recognizes many common LoRA-related suffixes, including standard LoRA, LoHa, LoKr, DoRA-style scale keys, alpha keys, and several other common naming patterns. Actual compatibility still depends on whether your ComfyUI version can load that LoRA format.
---
Troubleshooting
The editor says `Please select a LoRA first.`
Select a LoRA in the `lora_name` dropdown before opening the editor.
The editor fails to load the LoRA structure
Check that:
The LoRA file exists in ComfyUI's `models/loras` directory.
The LoRA is a valid `.safetensors` file.
ComfyUI can normally load the LoRA.
Strength changes do not seem obvious
Try increasing `strength_model` first. The final strength is the product of the global strength and the hierarchical effective strength.
Also remember that some LoRA layers may have subtle visual effects depending on the model, prompt, sampler, and generation stage.
Curve does not work
Curve mode uses ComfyUI hook/keyframe functionality. Make sure your ComfyUI version is recent enough to support the required hook APIs.
---
Development Notes
Main files:
```text
__init__.py                         ComfyUI node registration
nodes.py                            Node definition and HTTP tree endpoint
lora_parser.py                      LoRA key parsing and file hash cache
strength_tree.py                    Key-to-tree-path mapping and strength inheritance
weight_apply.py                     Static and dynamic LoRA patch application
web/js/tree_lora_loader.js          Frontend block editor
```
The frontend requests the parsed LoRA tree from:
```text
/hierarchical_lora_loader/tree?lora_name=...
```
The backend returns sorted tree paths, and the frontend builds the editable tree UI from those paths.
---
Recommended Git Ignore
For this custom node repository, it is recommended to avoid committing Python cache files and local Git/runtime artifacts:
```gitignore
__pycache__/
*.pyc
*.pyo
*.pyd
.env
.venv/
venv/
.DS_Store
Thumbs.db
```
---
License
No license has been specified yet. Add a license file if you want to define how others may use or modify this project.
