from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "public"
for size in (192, 512):
    scale = 4
    s = size * scale
    image = Image.new("RGB", (s, s), "#f5f1e8")
    draw = ImageDraw.Draw(image)
    points = [(0.2*s, 0.27*s), (0.72*s, 0.18*s), (0.81*s, 0.7*s), (0.29*s, 0.79*s)]
    draw.polygon(points, fill="#f5f1e8", outline="#252c29", width=int(0.045*s))
    draw.ellipse((0.43*s, 0.39*s, 0.59*s, 0.55*s), fill="#f5f1e8", outline="#e75b38", width=int(0.043*s))
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon-{size}.png")
