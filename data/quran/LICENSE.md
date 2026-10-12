# Quran data

Файлы `1.json`–`114.json` собраны скриптом `scripts/build-quran-data.py` из пакета
[quran-json 3.1.2](https://github.com/risan/quran-json) (лицензия CC BY-SA 4.0).

- Арабский текст: мусхаф Медины (Комплекс короля Фахда), риваят Хафс от Асыма, через [QuranEnc.com](https://quranenc.com)
- Транскрипция (латиница): [Tanzil.net](https://tanzil.net/trans/en.transliteration), буква айн показана как «ʿ»
- Смысловой перевод: Эльмир Кулиев, через [Tanzil.net](https://tanzil.net/trans/ru.kuliev)

Формат: `{ "n": номер суры, "v": [[арабский текст, транскрипция, перевод], ...] }`
