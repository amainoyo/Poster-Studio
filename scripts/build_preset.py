"""Sync the Poster Studio fallback preset with the live design on the Host.

The preset is the client-side fallback shown before the Host answers, so it
must match the live specification (same layers, colours and backdrop). Only
the backdrop image is re-encoded as JPEG to keep the bundled client small.
"""
import base64
import hashlib
import hmac
import io
import json
import os
import re
import subprocess
import time
import urllib.request

from PIL import Image

HOST = "127.0.0.1"
CRED = r"C:\Users\amain\.dsh\.credentials.yaml"
ROOT = r"D:\Deepseek\dsh-poster-studio"
BG_PNG = r"D:\Deepseek\poster_bg\newyear-2027-bg.png"
OUT = os.path.join(ROOT, "presets", "newyear-2027.json")


def b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64u_decode(text: str) -> bytes:
    pad = "=" * ((4 - len(text) % 4) % 4)
    return base64.urlsafe_b64decode(text.replace("-", "+").replace("_", "/") + pad)


text = open(CRED, encoding="utf-8").read()
secret = b64u_decode(
    re.search(r"client-connection/browser-session:.*?secret:\s*(\S+)", text, re.S).group(1).strip("\"'")
)


def candidate_ports() -> list[int]:
    """DSH_PORT 优先，否则扫描本机回环监听端口（宿主每次重启端口都会变）。"""
    env = os.environ.get("DSH_PORT")
    if env:
        return [int(env)]
    ports: set[int] = set()
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=10).stdout
        for line in out.splitlines():
            parts = line.split()
            # TCP  <local> <foreign> LISTENING <pid>
            if len(parts) >= 4 and parts[1].startswith("127.0.0.1:") and parts[3].upper() == "LISTENING":
                ports.add(int(parts[1].split(":")[1]))
    except Exception:
        pass
    return sorted(ports)


def fetch_spec():
    """在候选端口里找到带海报插件的宿主，取回设计稿。"""
    for port in candidate_ports():
        authority = f"{HOST}:{port}"
        now = int(time.time() * 1000)
        body = b64u(json.dumps({
            "version": 1, "authority": authority, "issuedAt": now,
            "expiresAt": now + 30 * 24 * 3600 * 1000,
        }, separators=(",", ":")).encode("utf-8"))
        signature = b64u(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())
        cookie = f"dsh-auth-{b64u(hashlib.sha256(authority.encode()).digest())}=v1.{body}.{signature}"
        request = urllib.request.Request(
            f"http://{authority}/poster-studio/spec",
            headers={"Cookie": cookie, "accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                spec = json.loads(response.read().decode("utf-8"))
        except Exception:
            continue
        if isinstance(spec, dict) and "layers" in spec:
            return spec
    raise SystemExit("没有找到带海报创作插件的宿主端口，可用 DSH_PORT 指定")


spec = fetch_spec()

buf = io.BytesIO()
Image.open(BG_PNG).convert("RGB").save(buf, "JPEG", quality=84, optimize=True, progressive=True)
spec.setdefault("background", {})["image"] = (
    "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
)
spec["background"]["opacity"] = spec["background"].get("opacity", 0.96)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(spec, handle, ensure_ascii=False, indent=2)
print("wrote", OUT, round(os.path.getsize(OUT) / 1024), "KiB")
print("layers:", [(l["id"], l.get("kind", "text")) for l in spec["layers"]])
