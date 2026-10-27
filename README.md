# Ghost Money

Find money your late relatives left behind in Pakistani banks.

When a bank account sits untouched for 10 years (15 since 2024), the bank hands the money to the State Bank of Pakistan, and the State Bank publishes the account holders' names in yearly Excel lists, one file per bank. Most families never look, and the ones who do get Ctrl+F on hundreds of files where one man is `MUHAMMAD RASOOL`, `MOHD. RASUL S/O ALLAH DITTA` and `M. RASOOL`.

Ghost Money searches every list from 2003 to 2025 at once, handles the spellings, scores each row with TabPFN, asks Gemma for a second opinion, and drafts the claim letter.

## Privacy
- **The name you type never leaves your browser.** The index is split into 4,096 pieces by spelling key. The page works out the keys itself and downloads only those pieces, so the server sees a piece number shared by thousands of names.
- **CNICs are checked on your device** against a salted hash; whole CNICs are not republished.
- **TabPFN gets numbers only** (12 per row: how many name parts match, how rare the name is, whether the province agrees, ...).
- **Gemma runs on your machine**: in the browser tab (WebLLM, Gemma 4 E2B) or through Ollama when you run Ghost Money locally.
- The voice summary is worded on the server from counts and bank names only.

## How well it matches
Test set: 11,036 pairs of list rows, labelled by CNIC (same 13-digit CNIC = same person, however it was spelled), split so no person is in both training and test. The look-alikes include "name twins": the identical name under a different CNIC.

| Right account ranked first (2,429 test searches) | |
|---|---|
| Ctrl+F | 51% |
| Fuzzy text match | 62% |
| TabPFN on 12 numbers | 77% |

When TabPFN scores a pair 0.9 or more, it is the same person 96% of the time (373 pairs). See `data/eval/` and `scripts/eval_matcher.py`, `scripts/eval_ranking.py`.

## Run it locally
```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # (bin/ on macOS/Linux)
python scripts/fetch_index.py                      # or build it yourself, below
cp .env.example .env                               # add keys you have; all optional
python -m gm.server                                # http://localhost:8000
```
With [Ollama](https://ollama.com) running and `OLLAMA_URL=http://localhost:11434` in `.env`, Gemma runs through Ollama (`ollama pull gemma4:e4b-it-qat`).

Build the index from the State Bank's files yourself:
```
pip install openpyxl xlrd lxml beautifulsoup4 html5lib
python -I scripts/download.py      # ~780 files, ~1.9 GB, slow server
python -I scripts/parse.py         # one clean table per year
python -I scripts/build_index.py   # shards + stats
```

## Data
State Bank of Pakistan, year-wise lists of unclaimed deposits: https://www.sbp.org.pk/sbp-bsc/year-wise-unclaimed-deposit
Claim procedure: https://www.sbp.org.pk/our-subsidiaries/sbp-bsc/procedure-for-unclaimed-deposit-refund

Not affiliated with the State Bank or any bank. Always confirm with the branch.

## License
MIT
