import { app } from "../../scripts/app.js";

const NODE_NAMES = new Set(["NovaFurryPromptBuilderV6", "NovaFurryPromptBuilder"]);
const SCHEMA_VERSION = 2;
const COVERINGS = ["fur", "feathers", "scales", "skin", "chitin", "mixed"];

const STYLE_DEFAULT = "ColScetch, masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, furry, anthro, clean lineart, flat lighting";
const BACKGROUND_DEFAULT = "plain white background, simple background, no scenery, no props";
const BASE_NEGATIVE = "worst quality, low quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, malformed hands, extra digits, missing digits, extra limbs, missing limbs, fused limbs, text, watermark, signature, logo";

const COVERING_RULES = {
  fur: {
    positive: "white fur, white body",
    negative: "scales, feathers",
  },
  feathers: {
    positive: "white feathers, white plumage",
    negative: "fur body, scales",
  },
  scales: {
    positive: "white scales, white body",
    negative: "fur body, feathers",
  },
  skin: {
    positive: "white skin, smooth skin",
    negative: "fur body, feathers, scales",
  },
  chitin: {
    positive: "white chitin, white exoskeleton",
    negative: "fur body, feathers, scales",
  },
  mixed: {
    positive: "white body, monochrome white natural covering",
    negative: "",
  },
};

const ADAPTIVE_RULES = [
  {
    triggers: ["cat", "feline", "lynx", "lion", "tiger", "leopard", "panther"],
    add: "canine, dog, wolf, fox",
  },
  {
    triggers: ["dog", "canine", "wolf", "fox", "coyote", "jackal"],
    add: "feline, cat",
  },
  {
    triggers: ["flat face", "very short muzzle", "short muzzle", "very short snout", "short snout"],
    add: "long muzzle, long snout",
  },
  {
    triggers: ["thin tail", "slender tail", "sleek tail", "low-fluff tail", "low fluff tail", "short fur tail"],
    add: "fluffy tail, bushy tail, plume tail",
  },
  {
    triggers: ["fluffy tail", "very fluffy tail", "bushy tail", "plume tail"],
    add: "thin tail, sleek tail",
  },
  {
    triggers: ["human-like hands", "human hands", "five fingered hands", "five-fingered hands"],
    add: "paw hands, animal hands",
  },
];

const HAIR_CONFLICT_RE = /\b(hair|hairstyle|bangs?|fringe|sidelocks?|locks?|ponytails?|pigtails?|braids?|braided|buns?|bob cut)\b/i;
const CHARACTER_FIELDS = ["subject", "body", "head", "details", "clothing"];

function widget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function getValue(node, name, fallback = "") {
  const w = widget(node, name);
  return w?.value ?? fallback;
}

function setWidget(node, name, value, callCallback = true) {
  const w = widget(node, name);
  if (!w || w.value === value) return;
  w.value = value;
  if (callCallback) {
    try { w.callback?.(value); } catch (_) {}
  }
}

function clean(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .trim()
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/^\s*,|,\s*$/g, "")
    .trim();
}

function normalizeClothing(value) {
  const text = clean(value);
  return /^(none|no clothing|no clothes|unclothed|bare)$/i.test(text) ? "nude" : text;
}

function splitTags(value) {
  return clean(value).split(",").map((x) => x.trim()).filter(Boolean);
}

function joinUniqueFragments(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const tag of splitTags(part)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
  }
  return out.join(", ");
}

function joinPromptBlocks(blocks) {
  return blocks.map(clean).filter(Boolean).join(",\n\n");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerMatches(source, trigger) {
  const normalized = clean(trigger).toLowerCase();
  if (!normalized) return false;
  const rx = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`, "i");
  return rx.test(source);
}

function canonicalCovering(value) {
  if (typeof value !== "string") return "fur";
  const v = value.trim().toLowerCase();
  if (!COVERINGS.includes(v)) {
    throw new Error(`covering must be one of: ${COVERINGS.join(", ")}.`);
  }
  return v;
}

function boolValue(node, name, fallback = true) {
  const value = getValue(node, name, fallback);
  return typeof value === "boolean" ? value : Boolean(value);
}

function characterText(node) {
  return CHARACTER_FIELDS.map((name) => clean(getValue(node, name, "")))
    .filter(Boolean)
    .join(", ")
    .toLowerCase();
}

function autoColor(node) {
  const covering = canonicalCovering(String(getValue(node, "covering", "fur")));
  const hair = boolValue(node, "hair", true);
  const parts = [COVERING_RULES[covering].positive];
  if (hair) parts.push("white hair");
  if (boolValue(node, "white_eyes", true)) parts.push("white irises, visible pupils");
  if (boolValue(node, "strict_monochrome", true)) parts.push("monochrome white coloring, unmarked body");
  if (boolValue(node, "natural_soft_tissue", true)) parts.push("natural flesh tone on exposed soft tissue");
  return joinUniqueFragments(...parts);
}

function autoBackground(node) {
  return boolValue(node, "white_background", true) ? BACKGROUND_DEFAULT : "";
}

function adaptiveNegative(node) {
  if (!boolValue(node, "adaptive_negative", true)) return "";
  const source = characterText(node);
  const additions = [];
  for (const rule of ADAPTIVE_RULES) {
    if (rule.triggers.some((trigger) => triggerMatches(source, trigger))) {
      additions.push(rule.add);
    }
  }
  return joinUniqueFragments(...additions);
}

function autoNegative(node) {
  const covering = canonicalCovering(String(getValue(node, "covering", "fur")));
  const parts = [BASE_NEGATIVE, COVERING_RULES[covering].negative];

  if (!boolValue(node, "hair", true)) {
    parts.push("head hair, hairstyle, bangs, fringe, sidelocks, ponytail, braid");
  }
  if (boolValue(node, "white_eyes", true)) {
    parts.push("colored irises");
  }
  if (boolValue(node, "strict_monochrome", true)) {
    parts.push("colored body, colored fur, colored feathers, colored scales, colored skin, colored hair, markings, stripes, spots, patches, gradients, multicolored body");
  }
  if (boolValue(node, "white_background", true)) {
    parts.push("detailed background, scenery, props");
  }

  parts.push(adaptiveNegative(node));
  parts.push(clean(getValue(node, "negative_manual", "")));
  return joinUniqueFragments(...parts);
}

function buildPositive(node) {
  return joinPromptBlocks([
    getValue(node, "style", ""),
    getValue(node, "subject", ""),
    getValue(node, "body", ""),
    getValue(node, "head", ""),
    getValue(node, "details", ""),
    normalizeClothing(getValue(node, "clothing", "")),
    getValue(node, "color", ""),
    getValue(node, "background", ""),
  ]);
}

function validateHairConsistency(data) {
  if (data?.hair !== false) return;
  const searchable = [data.subject, data.body, data.head, data.details]
    .filter((v) => typeof v === "string")
    .join(" ");
  const match = searchable.match(HAIR_CONFLICT_RE);
  if (match) {
    throw new Error(
      `hair=false conflicts with hairstyle description: found "${match[0]}". ` +
      "Set hair=true or remove hairstyle wording."
    );
  }
}

function regenerateDerived(node) {
  setWidget(node, "color", autoColor(node), false);
  setWidget(node, "background", autoBackground(node), false);
  setWidget(node, "negative", autoNegative(node), false);
  node.graph?.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function currentData(node) {
  const data = {
    schema_version: SCHEMA_VERSION,
    covering: canonicalCovering(String(getValue(node, "covering", "fur"))),
    hair: boolValue(node, "hair", true),
    options: {
      white_eyes: boolValue(node, "white_eyes", true),
      strict_monochrome: boolValue(node, "strict_monochrome", true),
      natural_soft_tissue: boolValue(node, "natural_soft_tissue", true),
      white_background: boolValue(node, "white_background", true),
      adaptive_negative: boolValue(node, "adaptive_negative", true),
    },
    style: clean(getValue(node, "style", "")),
    subject: clean(getValue(node, "subject", "")),
    body: clean(getValue(node, "body", "")),
    head: clean(getValue(node, "head", "")),
    details: clean(getValue(node, "details", "")),
    clothing: normalizeClothing(getValue(node, "clothing", "")),
    color: clean(getValue(node, "color", "")),
    background: clean(getValue(node, "background", "")),
    negative_manual: clean(getValue(node, "negative_manual", "")),
    negative: clean(getValue(node, "negative", "")),
    full_prompt: buildPositive(node),
  };
  validateHairConsistency(data);
  return data;
}

function applyJson(node, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The JSON root must be an object.");
  }

  const covering = "covering" in data ? canonicalCovering(data.covering) : "fur";
  let hair = true;
  if ("hair" in data) {
    if (typeof data.hair !== "boolean") throw new Error("hair must be boolean: true or false.");
    hair = data.hair;
  }

  // Preserve the node's current switches when compact analyzer JSON omits
  // `options`. If a full/partial options object is present, only explicitly
  // supplied keys are changed. This matches the standalone HTML builder.
  const options = {
    white_eyes: boolValue(node, "white_eyes", true),
    strict_monochrome: boolValue(node, "strict_monochrome", true),
    natural_soft_tissue: boolValue(node, "natural_soft_tissue", true),
    white_background: boolValue(node, "white_background", true),
    adaptive_negative: boolValue(node, "adaptive_negative", true),
  };
  if (data.options && typeof data.options === "object" && !Array.isArray(data.options)) {
    for (const key of Object.keys(options)) {
      if (key in data.options) {
        if (typeof data.options[key] !== "boolean") {
          throw new Error(`options.${key} must be boolean.`);
        }
        options[key] = data.options[key];
      }
    }
  }

  validateHairConsistency({ ...data, hair });

  // Structural controls first, without derived callbacks firing mid-import.
  setWidget(node, "covering", covering, false);
  setWidget(node, "hair", hair, false);
  for (const [key, value] of Object.entries(options)) setWidget(node, key, value, false);

  // Character fields. Compact analyzer JSON may omit any of them.
  for (const key of CHARACTER_FIELDS) {
    if (key in data && typeof data[key] !== "string") {
      throw new Error(`${key} must be a string.`);
    }
    if (typeof data[key] === "string") {
      const value = key === "clothing" ? normalizeClothing(data[key]) : clean(data[key]);
      setWidget(node, key, value, false);
    } else {
      setWidget(node, key, key === "clothing" ? "nude" : "", false);
    }
  }

  if ("negative_manual" in data && typeof data.negative_manual !== "string") {
    throw new Error("negative_manual must be a string.");
  }
  setWidget(node, "negative_manual", typeof data.negative_manual === "string" ? clean(data.negative_manual) : "", false);

  // Compute defaults with the imported switches / character first.
  setWidget(node, "style", STYLE_DEFAULT, false);
  regenerateDerived(node);

  // Full editor JSON is authoritative. This preserves custom mappings edited in HTML.
  for (const [key, fallback] of [
    ["style", STYLE_DEFAULT],
    ["color", autoColor(node)],
    ["background", autoBackground(node)],
    ["negative", autoNegative(node)],
  ]) {
    if (key in data && typeof data[key] !== "string") {
      throw new Error(`${key} must be a string.`);
    }
    setWidget(node, key, typeof data[key] === "string" ? clean(data[key]) : fallback, false);
  }

  node.graph?.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function downloadJson(node) {
  const data = currentData(node);
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "novafurry_character_prompt_v2.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importJsonFile(node) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.style.display = "none";

  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    if (!file) {
      picker.remove();
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      applyJson(node, data);
    } catch (error) {
      window.alert(`NovaFurry JSON import error:\n${error?.message ?? error}`);
    } finally {
      picker.remove();
    }
  });

  document.body.appendChild(picker);
  picker.click();
}

function addActionButton(node, label, action) {
  const button = node.addWidget("button", label, null, action);
  button.serialize = false;
  button.options ??= {};
  button.options.serialize = false;
  return button;
}

function installHooks(node) {
  if (node.__novaFurryV70HooksInstalled) return;
  node.__novaFurryV70HooksInstalled = true;

  const originalWidgetChanged = node.onWidgetChanged;
  node.onWidgetChanged = function(name, value, oldValue, widgetRef) {
    const result = originalWidgetChanged?.apply(this, arguments);

    // Structural toggles rebuild derived fields. Manual edits to COLOR / BACKGROUND /
    // NEGATIVE remain untouched until one of these controls changes or the rebuild
    // button is pressed. Character text edits do NOT silently overwrite an imported
    // custom negative from the standalone editor.
    if ([
      "covering", "hair", "white_eyes", "strict_monochrome",
      "natural_soft_tissue", "white_background", "adaptive_negative",
      "negative_manual",
    ].includes(name)) {
      regenerateDerived(this);
    }
    return result;
  };
}

app.registerExtension({
  name: "NovaFurry.PromptBuilder.WhiteBaseV701",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_NAMES.has(nodeData.name)) return;

    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
      const result = originalCreated?.apply(this, arguments);

      installHooks(this);

      addActionButton(this, "📥 Import character .json", () => importJsonFile(this));
      addActionButton(this, "♻ Rebuild COLOR / BG / NEGATIVE", () => {
        try {
          regenerateDerived(this);
        } catch (error) {
          window.alert(`NovaFurry rebuild error:\n${error?.message ?? error}`);
        }
      });
      addActionButton(this, "📤 Export structured .json", () => {
        try {
          downloadJson(this);
        } catch (error) {
          window.alert(`NovaFurry JSON export error:\n${error?.message ?? error}`);
        }
      });

      const width = Math.max(this.size?.[0] ?? 0, 560);
      const height = Math.max(this.size?.[1] ?? 0, 1660);
      this.setSize?.([width, height]);

      return result;
    };
  },
});
