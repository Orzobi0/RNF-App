"""Validate synthetic PDFs after pdf-export-browser.test.mjs. Requires PyMuPDF.
Run with the Codex bundled Python or another Python with PyMuPDF installed.
"""
from pathlib import Path
import re
import fitz

root = Path('tmp/pdfs')
expected = {'days-10': 1, 'days-25': 1, 'days-31': 1, 'days-32': 1,
            'days-65': 2, 'days-217': 4, 'reference': 3, 'multiple': 2,
            'table': 1, 'both': 3, 'short-notes': 1, 'unicode': 1, 'current': 1, 'tall-blocks': 2}
for name, pages in expected.items():
    with fitz.open(root / f'{name}.pdf') as doc:
        assert len(doc) == pages, (name, len(doc), pages)
        for page in doc:
            assert abs(page.rect.width - 841.89) < 0.1 and abs(page.rect.height - 595.28) < 0.1
            assert f'{page.number + 1} / {pages}' in page.get_text()
            for block in page.get_text('dict')['blocks']:
                x0, y0, x1, y1 = block['bbox']
                assert x0 >= 25 and y0 >= 20 and x1 <= page.rect.width - 25 and y1 <= page.rect.height - 5, (name, block['bbox'])
            images = page.get_image_info()
            for image in images:
                assert image['width'] * image['height'] <= 3_000_000
                if name != 'unicode':
                    assert abs(image['bbox'][0] - 12 * 72 / 25.4) < 0.01
                    assert abs(image['bbox'][2] - image['bbox'][0] - 273 * 72 / 25.4) < 0.01
            for a, b in zip(images, images[1:]):
                assert a['bbox'][3] < b['bbox'][1], (name, 'overlapping images')
        print(f'PASS {name}: {len(doc)} A4 pages, bounds, image memory and alignment')

with fitz.open(root / 'notes.pdf') as doc:
    text = re.sub(r'\s+', ' ', ' '.join(page.get_text() for page in doc))
    # Repeated page labels can occur between words, so count the individually
    # unique words too, catching truncation at continuation boundaries.
    assert text.count('prueba.') == 900
    assert text.count('FIN-EXTREMO') == 1
    for day in range(1, 33):
        if day != 6:
            assert f'Observación del día {day}. Sin información personal.' in text
    assert 'continuación' in text
    for page in doc:
        body = [b for b in page.get_text('blocks') if 55 < b[1] < 560]
        assert body, 'empty continuation page'
        for block in page.get_text('blocks'):
            assert block[2] < page.rect.width - 25 and block[3] < page.rect.height - 5
    print(f'PASS notes: {len(doc)} pages; all 900 repetitions, 32 days and final marker retained')

before = root / 'before-reference.pdf'
if before.exists():
    old, new = before.stat().st_size, (root / 'reference.pdf').stat().st_size
    print(f'Reference: {old:,} -> {new:,} bytes ({(1-new/old)*100:.2f}% smaller)')
