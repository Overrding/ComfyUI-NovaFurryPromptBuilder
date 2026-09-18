# ComfyUI NovaFurry Prompt Builder — White Base v7.0.1

This update aligns the ComfyUI node with the standalone **NovaFurry XL Prompt Builder v2** JSON format and the NovaFurry XL IL v17.0 white-base workflow.

## Compatibility

The implementation intentionally keeps the legacy node ids:

- `NovaFurryPromptBuilderV6`
- `NovaFurryPromptBuilder`

The **first ten input widget positions and first ten output slots are preserved from v6.1**, so an existing workflow can normally be updated by replacing the custom-node folder and restarting ComfyUI.

New controls are appended after the old `BACKGROUND` widget. New outputs are appended after the old `SCHEMA_VERSION` output.

## Positive prompt order

The generated positive prompt now uses:

`STYLE → SUBJECT → BODY → HEAD → DETAILS → CLOTHING → COLOR → BACKGROUND`

This keeps character identity and anatomy ahead of technical white-base conditioning.

## Covering modes

`covering` now supports:

- `fur`
- `feathers`
- `scales`
- `skin`
- `chitin`
- `mixed`

## New white-base controls

The node adds:

- `white_eyes`
- `strict_monochrome`
- `natural_soft_tissue`
- `white_background`
- `adaptive_negative`
- `negative_manual`
- editable final `negative`

`COLOR`, `BACKGROUND`, and `NEGATIVE` are visible editable fields. Structural switches regenerate these derived fields automatically. The **Rebuild COLOR / BG / NEGATIVE** button can regenerate them on demand.

Character text edits do not silently overwrite an imported custom negative. This is deliberate: a JSON exported from the HTML editor may contain user-edited mapping rules, and its final `color`, `background`, and `negative` values are treated as authoritative.

## Negative output

A new `NEGATIVE` output is appended after the legacy outputs. Connect it to the negative CLIP Text Encode input.

Default adaptive guards cover:

- feline ↔ canine confusion
- short / flat muzzle vs long muzzle
- sleek / thin tail vs fluffy tail
- fluffy tail vs thin tail
- human-like hands vs paw hands

## JSON v2

The node imports and exports the same main structure as the HTML editor:

```json
{
  "schema_version": 2,
  "covering": "fur",
  "hair": true,
  "options": {
    "white_eyes": true,
    "strict_monochrome": true,
    "natural_soft_tissue": true,
    "white_background": true,
    "adaptive_negative": true
  },
  "style": "...",
  "subject": "...",
  "body": "...",
  "head": "...",
  "details": "...",
  "clothing": "nude",
  "color": "...",
  "background": "...",
  "negative_manual": "",
  "negative": "...",
  "full_prompt": "..."
}
```

Compact analyzer JSON remains supported. If `style`, `color`, `background`, or `negative` are missing, the node supplies its normal derived/default values. If `options` is omitted, **the node now preserves the switches currently selected in the node**; if `options` is partial, only the keys present in JSON are changed. This matches the standalone HTML builder.

Old full JSON from v6/v6.1 is also accepted.

## Important normalization changes

- `muzzle` is **no longer replaced with `snout`**.
- underscores are normalized to spaces.
- `none / no clothing / no clothes / unclothed / bare` normalize to `nude`.
- `hair=false` is still checked against explicit hairstyle wording.
- empty positive blocks are skipped.

## Install

Replace the old `ComfyUI-NovaFurry-Prompt-Builder` folder inside `ComfyUI/custom_nodes/` with this one.

Then:

1. restart ComfyUI;
2. hard-refresh the browser (`Ctrl+Shift+R`);
3. open the workflow;
4. connect the new `NEGATIVE` output to your negative CLIP Text Encode.

## v7.0.1 mini patch

- Compact analyzer JSON without `options` no longer resets white-base switches to `true`.
- Partial `options` objects change only the explicitly supplied switches.
- No node type ids, widget positions, output slots, or workflow connections changed.
