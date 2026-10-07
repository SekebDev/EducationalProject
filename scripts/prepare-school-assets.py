"""Package the original Caderno video assets for browser use; no network calls.

Usage: python scripts/prepare-school-assets.py --source SOURCE --public PUBLIC --kit KIT
SOURCE contains higgsedit-original.zip, school-props.glb and school-props.blend.
"""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import random
import shutil
import struct
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageFont

NAMES = {
    'paper0': ('paper-ruled-cream', 'Papel pautado creme com furos'),
    'paper1': ('paper-ruled-warm', 'Papel pautado bege'),
    'paper2': ('paper-ruled-sage', 'Papel pautado sálvia com furos'),
    'paper3': ('paper-yellow', 'Papel amarelo'),
    'paper4': ('paper-pink', 'Papel rosa'),
    'paper5': ('paper-lilac', 'Papel lilás'),
    'paper6': ('paper-ruled-mint', 'Papel pautado verde com furos'),
    'paper7': ('paper-ruled-ivory', 'Papel pautado marfim'),
    'title-cream': ('torn-strip-cream', 'Faixa rasgada creme'),
    'title-yellow': ('torn-strip-yellow', 'Faixa rasgada amarela'),
    'tape': ('torn-strip-sage', 'Faixa rasgada sálvia'),
    'chalkboard': ('chalkboard', 'Fundo de quadro escuro'),
    'warm-background': ('warm-paper-background', 'Fundo de papel claro'),
    'pencil': ('pencil', 'Lápis 3D'),
    'eraser': ('eraser', 'Borracha 3D'),
    'paperball': ('crumpled-paper', 'Papel amassado 3D'),
    'paperclip': ('paperclip', 'Clipe 3D'),
}

CENTERS = {
    'pencil': (-1.3, .4, -.6), 'eraser': (1.1, .4, -.6),
    'crumpled-paper': (-.9, .4, .8), 'paperclip': (1, .4, .8),
}


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    assert magic == 0x46546C67 and version == 2 and length == len(raw)
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20 + size])
    offset = 20 + size
    binary_size, binary_kind = struct.unpack_from('<II', raw, offset)
    assert binary_kind == 0x004E4942
    binary = raw[offset + 8:offset + 8 + binary_size]
    return doc, binary


def split_glb(source, target, name):
    doc, old_binary = read_glb(source)
    def selected(node):
        n = node.get('name', '')
        return {'pencil': n.startswith(('Pencil', 'Ferrule')),
                'eraser': n.startswith('Eraser'),
                'crumpled-paper': n.startswith('Crumpled'),
                'paperclip': n.startswith('Paperclip')}[name]
    nodes = [copy.deepcopy(n) for n in doc['nodes'] if selected(n)]
    assert nodes and all('mesh' in n and not n.get('children') for n in nodes)
    assert not doc.get('images'), 'This exporter expects the texture-free school props.'
    mids = sorted({n['mesh'] for n in nodes})
    meshes = [copy.deepcopy(doc['meshes'][i]) for i in mids]
    aids, mats = set(), set()
    for mesh in meshes:
        for prim in mesh['primitives']:
            assert not prim.get('targets') and not prim.get('extensions')
            aids.update(prim['attributes'].values())
            if 'indices' in prim: aids.add(prim['indices'])
            if 'material' in prim: mats.add(prim['material'])
    aids, mats = sorted(aids), sorted(mats)
    accessors = [copy.deepcopy(doc['accessors'][i]) for i in aids]
    assert all('bufferView' in a and 'sparse' not in a for a in accessors)
    vids = sorted({a['bufferView'] for a in accessors})
    views, binary = [], bytearray()
    for index in vids:
        view = copy.deepcopy(doc['bufferViews'][index])
        start, size = view.get('byteOffset', 0), view['byteLength']
        while len(binary) % 4: binary.append(0)
        view['buffer'], view['byteOffset'] = 0, len(binary)
        binary.extend(old_binary[start:start + size]); views.append(view)
    for node in nodes:
        node['mesh'] = mids.index(node['mesh'])
        node['translation'] = [round(v - c, 7) for v, c in zip(node['translation'], CENTERS[name])]
    for accessor in accessors: accessor['bufferView'] = vids.index(accessor['bufferView'])
    for mesh in meshes:
        for prim in mesh['primitives']:
            prim['attributes'] = {k: aids.index(v) for k, v in prim['attributes'].items()}
            if 'indices' in prim: prim['indices'] = aids.index(prim['indices'])
            if 'material' in prim: prim['material'] = mats.index(prim['material'])
    result = {'asset': {'version': '2.0', 'generator': 'Caderno asset preparation'},
              'scene': 0, 'scenes': [{'name': name, 'nodes': list(range(len(nodes)))}],
              'nodes': nodes, 'meshes': meshes, 'accessors': accessors,
              'bufferViews': views, 'buffers': [{'byteLength': len(binary)}],
              'materials': [doc['materials'][i] for i in mats]}
    payload = json.dumps(result, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    total = 12 + 8 + len(payload) + 8 + len(binary)
    target.write_bytes(struct.pack('<III', 0x46546C67, 2, total) +
                       struct.pack('<II', len(payload), 0x4E4F534A) + payload +
                       struct.pack('<II', len(binary), 0x004E4942) + binary)
    checked, checked_binary = read_glb(target)
    assert len(checked['nodes']) == len(nodes)
    assert all(v['byteOffset'] + v['byteLength'] <= len(checked_binary) for v in checked['bufferViews'])
    return len(nodes)


def silhouette(original, width, height, seed):
    rng = random.Random(seed)
    pts = [(8 + rng.randint(0, 9), 12)]
    pts += [(x, 8 + rng.randint(0, 14)) for x in range(12, width - 12, 7)]
    pts += [(width - 8 - rng.randint(0, 14), y) for y in range(12, height - 12, 7)]
    pts += [(x, height - 8 - rng.randint(0, 15)) for x in range(width - 12, 12, -7)]
    pts += [(8 + rng.randint(0, 14), y) for y in range(height - 12, 12, -7)]
    path = 'M ' + ' L '.join(f'{x} {y}' for x, y in pts) + ' Z'
    if original in ('paper0', 'paper2', 'paper6'):
        for y in range(63, height - 22, 76):
            path += f' M 26 {y} A 6.5 7 0 1 0 13 {y} A 6.5 7 0 1 0 26 {y} Z'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><path fill="white" fill-rule="evenodd" d="{path}"/></svg>\n'


def main():
    parser = argparse.ArgumentParser()
    for arg in ('source', 'public', 'kit'): parser.add_argument('--' + arg, type=Path, required=True)
    args = parser.parse_args()
    public, kit = args.public.resolve(), args.kit.resolve()
    for p in (public / 'images', public / 'masks', public / 'decorations', public / 'models', kit / 'originals', kit / 'source'):
        p.mkdir(parents=True, exist_ok=True)
    assets, original_bytes = [], 0
    with zipfile.ZipFile(args.source / 'higgsedit-original.zip') as z:
        for original, (name, label) in NAMES.items():
            raw = z.read(f'caderno-v2/assets/{original}.png')
            (kit / 'originals' / f'{name}.png').write_bytes(raw)
            original_bytes += len(raw)
            import io
            im = Image.open(io.BytesIO(raw)).convert('RGBA')
            ow, oh = im.size
            sprite = name in CENTERS
            bounds = (0, 0, ow, oh)
            if sprite:
                alpha_bounds = im.getchannel('A').getbbox()
                assert alpha_bounds
                l, t, r, b = alpha_bounds
                bounds = (max(0, l - 12), max(0, t - 12), min(ow, r + 12), min(oh, b + 12))
                im = im.crop(bounds)
            has_alpha = im.getchannel('A').getextrema()[0] < 255
            image = im if has_alpha else im.convert('RGB')
            web = public / 'images' / f'{name}.webp'
            image.save(web, 'WEBP', quality=92 if sprite else 88, method=6, alpha_quality=100, exact=True)
            decoded = Image.open(web).convert('RGBA')
            assert decoded.size == im.size
            assert ImageChops.difference(decoded.getchannel('A'), im.getchannel('A')).getbbox() is None
            mobile = image.copy(); mobile.thumbnail((320, 320), Image.Resampling.LANCZOS)
            mobile_path = public / 'images' / f'{name}-320.webp'
            mobile.save(mobile_path, 'WEBP', quality=86, method=6, alpha_quality=100, exact=True)
            item = {'id': name, 'label': label, 'kind': 'sprite3d' if sprite else 'background' if not has_alpha else 'paper',
                    'src': f'/landing/school-kit/images/{name}.webp', 'width': im.width, 'height': im.height,
                    'bytes': web.stat().st_size, 'transparent': has_alpha, 'mobile': {'src': f'/landing/school-kit/images/{name}-320.webp', 'width': mobile.width, 'height': mobile.height, 'bytes': mobile_path.stat().st_size},
                    'original': {'width': ow, 'height': oh, 'cropBox': bounds}, 'pivot': [0.5, 0.5], 'safePaddingRatio': .12}
            if item['kind'] == 'paper':
                seed = 100 + int(original[-1]) if original.startswith('paper') else {'title-cream': 301, 'title-yellow': 302, 'tape': 304}[original]
                svg = public / 'masks' / f'{name}.svg'
                svg.write_text(silhouette(original, ow, oh, seed), encoding='utf-8')
                item['mask'] = f'/landing/school-kit/masks/{name}.svg'
            assets.append(item)
        for filename in ('paper_assets.py', 'school_props_blender.py', 'conceito.jsx'):
            (kit / 'source' / filename).write_bytes(z.read('caderno-v2/' + filename))
    doodles = {
        'loop-arrow': ('0 0 360 130', 'M 8 24 C 90 76 174 89 215 48 C 257 6 126 23 137 75 C 150 126 236 109 340 44 M 306 42 L 340 44 L 327 73'),
        'scribble-underline': ('0 0 300 32', 'M 7 12 L 284 7 M 18 17 L 260 24 M 30 24 L 207 17'),
        'chalk-scribbles': ('0 0 400 180', 'M 20 20 L 80 46 L 104 22 M 127 82 C 174 22 275 70 241 110 C 209 150 143 142 127 82 M 70 164 L 321 173'),
    }
    for name, (box, d) in doodles.items():
        (public / 'decorations' / f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="{d}"/></svg>\n', encoding='utf-8')
    models = []
    for name in CENTERS:
        output = public / 'models' / f'{name}.glb'
        parts = split_glb(args.source / 'school-props.glb', output, name)
        models.append({'id': name, 'src': f'/landing/school-kit/models/{name}.glb', 'bytes': output.stat().st_size, 'parts': parts, 'origin': [0, 0, 0], 'upAxis': 'Y', 'units': 'meters'})
    shutil.copy2(args.source / 'school-props.glb', kit / 'source' / 'school-props.glb')
    shutil.copy2(args.source / 'school-props.blend', kit / 'source' / 'school-props.blend')
    manifest = {'version': 1, 'source': 'Caderno — papel rasgado e objetos escolares flutuantes, Higgsfield', 'palette': {'chalkboard': '#192327', 'paper': '#F1EEDF', 'ink': '#193F34', 'yellow': '#ECFA64', 'pink': '#EEA7C1', 'lilac': '#C5BCDC'}, 'images': assets, 'models': models, 'decorations': [f'/landing/school-kit/decorations/{n}.svg' for n in doodles], 'verified': {'webpAlphaMatchesSource': True, 'glbBufferRanges': True}}
    (public / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    # Contact sheet lets the user inspect every texture and transparent sprite.
    board = Image.new('RGB', (1200, 1136), '#E9E6DC'); draw = ImageDraw.Draw(board)
    font_dir = Path('C:/Windows/Fonts')
    font = ImageFont.truetype(str(font_dir / 'segoeui.ttf'), 16)
    heading = ImageFont.truetype(str(font_dir / 'segoeuib.ttf'), 31)
    draw.text((26, 20), 'Caderno / kit de assets', fill='#193F34', font=heading)
    draw.text((27, 63), 'Papéis rasgados, texturas e objetos 3D • WebP com transparência', fill='#526153', font=font)
    for i, a in enumerate(assets):
        x, y = 24 + (i % 4) * 294, 108 + (i // 4) * 204
        bg = '#243338' if a['transparent'] else '#E4E1D5'
        draw.rounded_rectangle((x, y, x + 279, y + 169), 7, fill=bg)
        im = Image.open(public / 'images' / (a['id'] + '.webp')).convert('RGBA')
        im.thumbnail((253, 151), Image.Resampling.LANCZOS)
        board.paste(im, (x + (279-im.width)//2, y + (169-im.height)//2), im)
        draw.text((x+2, y+175), a['label'], fill='#193F34', font=font)
    board.save(kit / 'asset-preview.jpg', quality=92)
    all_web_bytes = sum(a['bytes'] for a in assets)
    report = {'images': len(assets), 'masks': len(list((public/'masks').glob('*.svg'))), 'decorations': len(doodles), 'models': len(models), 'originalPngBytes': original_bytes, 'webpBytes': all_web_bytes, 'mobileWebpBytes': sum(a['mobile']['bytes'] for a in assets), 'modelsBytes': sum(m['bytes'] for m in models), 'checks': 'alpha intact; dimensions correct; GLB chunks and buffer ranges valid'}
    (kit / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
