"""Build the Poster Studio fallback preset (client-side default design)."""
import base64
import io
import json
import os

from PIL import Image

ROOT = r"D:\Deepseek\dsh-poster-studio"
BG_PNG = r"D:\Deepseek\poster_bg\newyear-2027-bg.png"
OUT = os.path.join(ROOT, "presets", "newyear-2027.json")

buf = io.BytesIO()
Image.open(BG_PNG).convert("RGB").save(buf, "JPEG", quality=84, optimize=True, progressive=True)
data = buf.getvalue()
print("background jpeg:", round(len(data) / 1024), "KiB")

preset = {
    "version": 1,
    "size": "1080x1920",
    "layers": [
        {
            "id": "title", "text": "新岁序开", "size": 186, "weight": 700, "color": "#ffe9a8",
            "font": "ma-shan-zheng", "align": "center", "x": 0.5, "y": 0.245,
            "letterSpacing": 24, "lineHeight": 1.15, "maxWidth": 0.88, "shadow": 0.4,
        },
        {
            "id": "subtitle", "text": "2027 元旦快乐 · HAPPY NEW YEAR 2027", "size": 54, "weight": 700,
            "color": "#ffffff", "font": "noto-sans-sc", "align": "center", "x": 0.5, "y": 0.325,
            "letterSpacing": 5, "lineHeight": 1.4, "maxWidth": 0.9,
        },
        {
            "id": "tag", "text": "辞旧迎新 · 万事皆如意", "size": 42, "weight": 500, "color": "#ffd98c",
            "font": "noto-sans-sc", "align": "center", "x": 0.5, "y": 0.385,
            "letterSpacing": 10, "lineHeight": 1.5, "maxWidth": 0.9,
        },
        {
            "id": "year", "text": "2027", "size": 400, "weight": 800, "color": "#ffd97d30",
            "font": "playfair", "align": "center", "x": 0.5, "y": 0.635,
            "letterSpacing": 8, "lineHeight": 1, "maxWidth": 0.92,
        },
        {
            "id": "footer", "text": "2027.01.01 · 恭贺新禧 · 岁启新程", "size": 38, "weight": 600,
            "color": "#ffe9a8d0", "font": "noto-sans-sc", "align": "center", "x": 0.5, "y": 0.9,
            "letterSpacing": 6, "lineHeight": 1.4, "maxWidth": 0.9,
        },
    ],
    "colors": {
        "c1": "#3a0509", "c2": "#7a0c14", "c3": "#b3121b", "c4": "#ffd97d", "c5": "#4a070c",
    },
    "shader": {
        "scale": 1.4, "offsetX": -1.4, "offsetY": -0.44, "grain": 0.006, "bloom": 0.5,
        "vignette": 0.32, "lightCore": 0.24, "lightHalo": 0.08, "speed": 0.6, "paused": True,
    },
    "background": {
        "image": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
        "opacity": 0.96,
    },
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(preset, handle, ensure_ascii=False, indent=2)
print("wrote", OUT, round(os.path.getsize(OUT) / 1024), "KiB")
