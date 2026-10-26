# Converts the opaque README stills to high-quality JPEG (phone mockups and the library strip keep PNG transparency).
import os
from PIL import Image
MEDIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'media')
OPAQUE = ['hero', 'shelf', 'quiz-shelf', 'reading', 'reading-title', 'quiz-answer', 'quiz-intro', 'detail-hover', 'memory']
for base in OPAQUE:
    for suf in ('', '-dark'):
        src = os.path.join(MEDIA, f'{base}{suf}.png')
        if not os.path.exists(src): continue
        Image.open(src).convert('RGB').save(os.path.join(MEDIA, f'{base}{suf}.jpg'), quality=90, optimize=True, progressive=True, subsampling=0)
        os.remove(src)
        print('jpg', base + suf)
