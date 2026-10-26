import sys
from PIL import Image, ImageDraw, ImageFilter
import os
HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, '.frames') + '/'; OUT = os.path.join(HERE, '..', '..', 'docs', 'media') + '/'
def phone(path, w=520):
    shot = Image.open(path).convert('RGB')
    h = round(shot.height * w / shot.width)
    shot = shot.resize((w, h), Image.LANCZOS)
    bez, rad = 14, 64
    W, H = w + 2*bez, h + 2*bez
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle((0, 0, W-1, H-1), rad + bez, fill=(22, 22, 26, 255))
    d.rounded_rectangle((1, 1, W-2, H-2), rad + bez - 1, outline=(70, 70, 78, 255), width=2)
    mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, w-1, h-1), rad, fill=255)
    body.paste(shot, (bez, bez), mask)
    # dynamic-island pill
    ImageDraw.Draw(body).rounded_rectangle((W//2-62, bez+16, W//2+62, bez+50), 17, fill=(8, 8, 10, 255))
    return body
def trio(suffix):
    ps = [phone(FR + f'm-{n}{suffix}.png') for n in ('shelf', 'reading', 'quiz')]
    pw, ph = ps[0].size; gap, m = 70, 90
    W = 3*pw + 2*gap + 2*m; H = ph + 2*m + 40
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
    for k in range(3):
        x = m + k*(pw+gap); y = m + (0 if k == 1 else 40)
        sd.rounded_rectangle((x+10, y+40, x+pw-10, y+ph+20), 90, fill=(0, 0, 0, 105))
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    canvas.alpha_composite(shadow)
    for k, p in enumerate(ps):
        canvas.alpha_composite(p, (m + k*(pw+gap), m + (0 if k == 1 else 40)))
    canvas = canvas.resize((W*2//3, H*2//3), Image.LANCZOS)
    canvas.save(OUT + f'mobile{suffix}.png', optimize=True)
    print('mobile' + suffix, canvas.size)
trio(''); trio('-dark')
