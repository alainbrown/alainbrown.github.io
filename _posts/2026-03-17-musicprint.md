---
title: "An offline Shazam that can run entirely on a phone"
date: 2026-03-17
description: "Identifying songs with 96.5% recall at 25-75x compression compared to Shazam-like spectrograms."
image: /assets/og/musicprint.png
---

I wanted to know if you could build an offline Shazam that runs entirely on a phone — no server, no network. The answer is: mostly yes, and you don't even need to train a model.

## The finding

[MERT-v1-95M](https://huggingface.co/m-a-p/MERT-v1-95M), a pretrained music transformer, produces embeddings that are already discriminative enough for song identification. No fine-tuning, no adapter, no custom loss function. Just freeze it, mean-pool the output, and search by cosine similarity.

On a corpus of 6,839 songs (Billboard Hot 100, 1920–2020s), frozen MERT achieves 96.6% top-1 recall. The interesting part is what happens when you compress it.

## The compression pipeline

<img src="/assets/posts/musicprint/musicprint-indexing.svg" alt="MusicPrint indexing pipeline" style="max-width: 420px; margin: 2em auto; display: block;">

A 3-minute song produces ~175 overlapping 5-second windows, each encoded as a 768-dim float vector. That's 632 KB per song — way too much for a phone database.

Three compression stages bring it down:

1. **K-means clustering** — Most windows in a song are redundant (repeated chorus, sustained sections). Clustering 175 windows to 10 centroids loses nothing at 100 songs and only 3.4% at 7,000 songs.

2. **PCA** — The 768-dim embedding space has an effective dimensionality around 256 for fingerprinting. PCA to 256 dims preserves 96.1% recall.

3. **Binary hashing** — Take the sign of each PCA dimension (positive → 1, negative → 0). Search with Hamming distance instead of cosine similarity.

The surprise: PCA 256 + binary hashing (96.5% recall) actually outperforms raw binary hashing without PCA (95.1%). Removing noise dimensions before binarization makes the sign bits more discriminative.

| Config | Storage/song | Recall | 10M songs |
|--------|-------------|--------|-----------|
| Full embeddings | 30 KB | 96.6% | 286 GB |
| k=10 + PCA 256 + binary | 320 B | 96.5% | 3 GB |
| k=10 + PCA 128 + binary | 160 B | 92.0% | 1.5 GB |

At 320 bytes per song, 10 million songs fit in 3 GB. That's an iPhone. For context, spectrogram-based approaches like Shazam typically store 8–24 KB per song (based on back-of-envelope math: a 3-minute song produces thousands of 32-bit landmark hashes). MusicPrint is 25–75x smaller.

## What didn't work

Before discovering frozen MERT was sufficient, I spent time on fine-tuning approaches that all failed:

- **ArcFace with Tanh adapter**: Hash collapse — the Tanh activation saturated and all songs produced the same binary hash. Also the margin was accidentally set to 28.6 radians instead of 0.5.
- **ArcFace with MLP adapter**: 40-50% recall. Turns out the evaluation was flawed (comparing only 2 clips per song instead of searching a full index).
- **Contrastive loss with full-song training**: Seemed to work, but when I fixed the evaluation, frozen MERT without any training matched it.

The lesson: test your evaluation before blaming the model.

## What's left

The 96.5% recall is on 7,000 songs. The real question is whether it holds at 10 million. The embedding space gets more crowded as you add songs, and 3.4% degradation from 100 to 7,000 songs might extrapolate badly.

Other open questions: how does it handle noisy recordings (phone mic in a bar), clips not aligned to the 1-second grid, and corpora of very similar songs (all classical piano, all EDM drops).

The code, experiments, and paper are on GitHub: [alainbrown/musicprint](https://github.com/alainbrown/musicprint)

- [Live demo](https://alainbrown-musicprint.hf.space/) — record or upload audio, get a match (Gradio on HuggingFace)
- [Research paper](https://github.com/alainbrown/musicprint/blob/main/PAPER.md) — full results and methodology
- [Experiments notebook](https://github.com/alainbrown/musicprint/blob/main/experiments.py) — reproducible in JupyterLab
- [Embedding dataset](https://huggingface.co/datasets/alainbrown/musicprint-embeddings) — pre-computed MERT embeddings for 6,839 songs
