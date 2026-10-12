"""Собирает data/quran/{1..114}.json из пакета quran-json (npm, CC BY-SA 4.0).

Источники внутри пакета:
  - арабский текст: мусхаф Медины (риваят Хафс), Uthmani, через QuranEnc.com
  - транскрипция: Tanzil.net (en.transliteration)
  - смысловой перевод: Эльмир Кулиев, через Tanzil.net (ru.kuliev)

Запуск:
  npm pack quran-json@3.1.2 && tar xzf quran-json-3.1.2.tgz
  python3 scripts/build-quran-data.py package/dist
"""
import json
import re
import sys
from pathlib import Path


def clean_translit(text):
    # В схеме Tanzil «AA» обозначает букву ʿайн
    text = re.sub(r'AA', 'ʿ', text)
    return text[:1].upper() + text[1:] if text else text


def main(dist_dir):
    dist = Path(dist_dir)
    translit = json.loads((dist / 'quran_transliteration.json').read_text(encoding='utf-8'))
    russian = json.loads((dist / 'quran_ru.json').read_text(encoding='utf-8'))
    out_dir = Path(__file__).resolve().parent.parent / 'data' / 'quran'
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for surah_t, surah_r in zip(translit, russian):
        assert surah_t['id'] == surah_r['id']
        verses = []
        for v_t, v_r in zip(surah_t['verses'], surah_r['verses']):
            assert v_t['id'] == v_r['id'] and v_t['text'] == v_r['text']
            verses.append([v_t['text'], clean_translit(v_t['transliteration']), v_r['translation']])
        total += len(verses)
        payload = {'n': surah_t['id'], 'v': verses}
        (out_dir / f"{surah_t['id']}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    assert total == 6236, total
    print(f'OK: 114 сур, {total} аятов → {out_dir}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'package/dist')
