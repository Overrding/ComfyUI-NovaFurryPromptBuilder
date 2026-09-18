from __future__ import annotations

import re


class NovaFurryPromptBuilderV6:
    """NovaFurry XL white-base character prompt builder.

    v7.0.1 keeps the legacy node id / first ten widget positions from v6.1 so an
    existing workflow can be updated without rewiring. New white-base options
    and negative-prompt fields are appended after the legacy widgets.

    The browser extension owns the convenient auto-generation behaviour. The
    backend treats the visible STYLE / COLOR / BACKGROUND / NEGATIVE fields as
    authoritative so JSON imported from the standalone editor is preserved.
    """

    SCHEMA_VERSION = 2

    STYLE_DEFAULT = (
        "ColScetch, masterpiece, best quality, amazing quality, very aesthetic, "
        "newest, absurdres, furry, anthro, clean lineart, flat lighting"
    )
    BACKGROUND_DEFAULT = "plain white background, simple background, no scenery, no props"

    COVERINGS = ("fur", "feathers", "scales", "skin", "chitin", "mixed")

    COVERING_POSITIVE = {
        "fur": "white fur, white body",
        "feathers": "white feathers, white plumage",
        "scales": "white scales, white body",
        "skin": "white skin, smooth skin",
        "chitin": "white chitin, white exoskeleton",
        "mixed": "white body, monochrome white natural covering",
    }

    COVERING_NEGATIVE = {
        "fur": "scales, feathers",
        "feathers": "fur body, scales",
        "scales": "fur body, feathers",
        "skin": "fur body, feathers, scales",
        "chitin": "fur body, feathers, scales",
        "mixed": "",
    }

    BASE_NEGATIVE = (
        "worst quality, low quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, "
        "malformed hands, extra digits, missing digits, extra limbs, missing limbs, fused limbs, "
        "text, watermark, signature, logo"
    )

    HAIR_CONFLICT_RE = re.compile(
        r"\b(hair|hairstyle|bangs?|fringe|sidelocks?|locks?|ponytails?|pigtails?|"
        r"braids?|braided|buns?|bob cut)\b",
        re.IGNORECASE,
    )

    @classmethod
    def INPUT_TYPES(cls):
        # IMPORTANT: the first ten entries intentionally preserve the v6.1 order.
        # ComfyUI serializes widget values positionally in workflows.
        return {
            "required": {
                "style": (
                    "STRING",
                    {
                        "default": cls.STYLE_DEFAULT,
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
                "covering": (list(cls.COVERINGS), {"default": "fur"}),
                "hair": ("BOOLEAN", {"default": True}),
                "subject": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": False},
                ),
                "body": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": False},
                ),
                "color": (
                    "STRING",
                    {
                        "default": cls.auto_color("fur", True, True, True, True),
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
                "head": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": False},
                ),
                "clothing": (
                    "STRING",
                    {"default": "nude", "multiline": True, "dynamicPrompts": False},
                ),
                "details": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": False},
                ),
                "background": (
                    "STRING",
                    {
                        "default": cls.BACKGROUND_DEFAULT,
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
                # Appended v7 controls. Keeping them after BACKGROUND protects old workflows.
                "white_eyes": ("BOOLEAN", {"default": True}),
                "strict_monochrome": ("BOOLEAN", {"default": True}),
                "natural_soft_tissue": ("BOOLEAN", {"default": True}),
                "white_background": ("BOOLEAN", {"default": True}),
                "adaptive_negative": ("BOOLEAN", {"default": True}),
                "negative_manual": (
                    "STRING",
                    {"default": "", "multiline": True, "dynamicPrompts": False},
                ),
                "negative": (
                    "STRING",
                    {
                        "default": cls.auto_negative(
                            "fur", True, True, True, True, True, "", ""
                        ),
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
            }
        }

    # The first ten outputs also preserve v6.1 slot indices.
    RETURN_TYPES = (
        "STRING", "STRING", "STRING", "STRING", "STRING",
        "STRING", "STRING", "STRING", "STRING", "INT",
        "STRING", "STRING",
    )
    RETURN_NAMES = (
        "FULL_PROMPT", "STYLE", "SUBJECT", "BODY", "COLOR",
        "HEAD", "CLOTHING", "DETAILS", "BACKGROUND", "SCHEMA_VERSION",
        "NEGATIVE", "NEGATIVE_MANUAL",
    )
    FUNCTION = "build_prompt"
    CATEGORY = "NovaFurry/Prompt"

    @staticmethod
    def _clean(value):
        if value is None:
            return ""
        text = str(value).replace("_", " ").strip()
        text = re.sub(r"\s*\n+\s*", " ", text)
        text = re.sub(r"\s{2,}", " ", text)
        text = re.sub(r"\s+,", ",", text)
        text = re.sub(r",{2,}", ",", text)
        text = re.sub(r"^\s*,|,\s*$", "", text)
        return text.strip()

    @classmethod
    def _normalize_clothing_for_prompt(cls, value):
        cleaned = cls._clean(value)
        if re.fullmatch(
            r"(?:none|no clothing|no clothes|unclothed|bare)",
            cleaned,
            flags=re.IGNORECASE,
        ):
            return "nude"
        return cleaned

    @classmethod
    def _split_tags(cls, value):
        text = cls._clean(value)
        return [part.strip() for part in text.split(",") if part.strip()]

    @classmethod
    def _join_unique_fragments(cls, *values):
        seen = set()
        out = []
        for value in values:
            for tag in cls._split_tags(value):
                key = tag.lower()
                if key not in seen:
                    seen.add(key)
                    out.append(tag)
        return ", ".join(out)

    @classmethod
    def auto_color(
        cls,
        covering,
        hair,
        white_eyes=True,
        strict_monochrome=True,
        natural_soft_tissue=True,
    ):
        covering = covering if covering in cls.COVERINGS else "fur"
        parts = [cls.COVERING_POSITIVE[covering]]
        if bool(hair):
            parts.append("white hair")
        if bool(white_eyes):
            parts.append("white irises, visible pupils")
        if bool(strict_monochrome):
            parts.append("monochrome white coloring, unmarked body")
        if bool(natural_soft_tissue):
            parts.append("natural flesh tone on exposed soft tissue")
        return cls._join_unique_fragments(*parts)

    @classmethod
    def _trigger_matches(cls, source, trigger):
        trigger = cls._clean(trigger).lower()
        if not trigger:
            return False
        return re.search(
            rf"(^|[^a-z0-9]){re.escape(trigger)}([^a-z0-9]|$)",
            source,
            flags=re.IGNORECASE,
        ) is not None

    @classmethod
    def _adaptive_negative(cls, character_text):
        source = cls._clean(character_text).lower()
        rules = (
            (
                ("cat", "feline", "lynx", "lion", "tiger", "leopard", "panther"),
                "canine, dog, wolf, fox",
            ),
            (
                ("dog", "canine", "wolf", "fox", "coyote", "jackal"),
                "feline, cat",
            ),
            (
                ("flat face", "very short muzzle", "short muzzle", "very short snout", "short snout"),
                "long muzzle, long snout",
            ),
            (
                ("thin tail", "slender tail", "sleek tail", "low-fluff tail", "low fluff tail", "short fur tail"),
                "fluffy tail, bushy tail, plume tail",
            ),
            (
                ("fluffy tail", "very fluffy tail", "bushy tail", "plume tail"),
                "thin tail, sleek tail",
            ),
            (
                ("human-like hands", "human hands", "five fingered hands", "five-fingered hands"),
                "paw hands, animal hands",
            ),
        )
        out = []
        for triggers, add in rules:
            if any(cls._trigger_matches(source, trigger) for trigger in triggers):
                out.append(add)
        return cls._join_unique_fragments(*out)

    @classmethod
    def auto_negative(
        cls,
        covering,
        hair,
        white_eyes,
        strict_monochrome,
        white_background,
        adaptive_negative,
        negative_manual,
        character_text,
    ):
        covering = covering if covering in cls.COVERINGS else "fur"
        parts = [cls.BASE_NEGATIVE, cls.COVERING_NEGATIVE[covering]]
        if not bool(hair):
            parts.append("head hair, hairstyle, bangs, fringe, sidelocks, ponytail, braid")
        if bool(white_eyes):
            parts.append("colored irises")
        if bool(strict_monochrome):
            parts.append(
                "colored body, colored fur, colored feathers, colored scales, colored skin, "
                "colored hair, markings, stripes, spots, patches, gradients, multicolored body"
            )
        if bool(white_background):
            parts.append("detailed background, scenery, props")
        if bool(adaptive_negative):
            parts.append(cls._adaptive_negative(character_text))
        if negative_manual:
            parts.append(negative_manual)
        return cls._join_unique_fragments(*parts)

    @classmethod
    def _validate_hair_consistency(cls, hair, *values):
        if bool(hair):
            return
        searchable = " ".join(str(v or "") for v in values)
        match = cls.HAIR_CONFLICT_RE.search(searchable)
        if match:
            raise ValueError(
                f'hair=false conflicts with hairstyle description: found "{match.group(0)}". '
                "Set hair=true or remove hairstyle wording."
            )

    @classmethod
    def build_prompt(
        cls,
        style,
        covering,
        hair,
        subject,
        body,
        color,
        head,
        clothing,
        details,
        background,
        white_eyes,
        strict_monochrome,
        natural_soft_tissue,
        white_background,
        adaptive_negative,
        negative_manual,
        negative,
    ):
        covering = covering if covering in cls.COVERINGS else "fur"
        hair = bool(hair)

        style = cls._clean(style)
        subject = cls._clean(subject)
        body = cls._clean(body)
        color = cls._clean(color)
        head = cls._clean(head)
        clothing_raw = cls._clean(clothing)
        clothing_prompt = cls._normalize_clothing_for_prompt(clothing_raw)
        details = cls._clean(details)
        background = cls._clean(background)
        negative_manual = cls._clean(negative_manual)
        negative = cls._clean(negative)

        cls._validate_hair_consistency(hair, subject, body, head, details)

        # v2 editor order: identity/anatomy first, technical white-base blocks last.
        blocks = [
            style,
            subject,
            body,
            head,
            details,
            clothing_prompt,
            color,
            background,
        ]
        full_prompt = ",\n\n".join(block for block in blocks if block)

        return (
            full_prompt,
            style,
            subject,
            body,
            color,
            head,
            clothing_raw,
            details,
            background,
            cls.SCHEMA_VERSION,
            negative,
            negative_manual,
        )


NODE_CLASS_MAPPINGS = {
    # Keep all legacy ids pointing to the upgraded implementation.
    "NovaFurryPromptBuilderV6": NovaFurryPromptBuilderV6,
    "NovaFurryPromptBuilder": NovaFurryPromptBuilderV6,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaFurryPromptBuilderV6": "NovaFurry Prompt Builder · White Base v7.0.1",
    "NovaFurryPromptBuilder": "NovaFurry Prompt Builder · White Base v7.0.1 (Legacy ID)",
}

WEB_DIRECTORY = "./web/js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
