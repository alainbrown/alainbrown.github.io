---
title: "Watching a language model denoise instead of type"
date: 2026-06-12
description: "DiffusionGemma generates a whole block of text from noise in parallel, not left-to-right. I built a visualizer so you can watch it happen."
image: /assets/og/diffusiongemma.png
---

Every autoregressive LLM you've used writes the same way: one token at a time, strictly left-to-right, each token conditioned on the ones before it. Diffusion language models don't. They start a whole block of text as pure noise and *denoise* it — revealing tokens in parallel over a handful of steps, roughly in order of confidence, not in reading order. [DiffusionGemma](https://huggingface.co/google/diffusiongemma-26B-A4B-it) does this, and I built a small visualizer so you can actually watch it. It's worth seeing.

<video src="/assets/posts/diffusiongemma/denoise-acrostic.mp4" autoplay loop muted playsinline style="max-width: 640px; width: 100%; margin: 2em auto; display: block; border-radius: 12px;"></video>

That's the model answering *"Write a six-line poem about the ocean where the lines start with the letters O, C, E, A, N, S in that order."* Notice what it does first: it doesn't write line one and move on. It scatters the line-start letters across the block before most of the lines exist, then fills the middles in. That ordering is the whole story.

## What a diffusion language model is

An autoregressive model factorizes text as a product of conditionals: P(token | everything to the left). It samples position 1, appends it, samples position 2, and so on. The output grows one token at a time, and you can never revise a token once it's emitted.

A diffusion language model factorizes differently. It works over a fixed-length **block** — a "canvas" of positions — that begins entirely masked: every slot is noise, rendered here as `░░░░`. Then it runs a small number of *denoising steps*. At each step the model looks at the whole partially-revealed canvas and decides which masked positions it's now confident enough to fill, committing several at once. High-confidence positions get revealed early; ambiguous ones wait for more context to materialize around them. After enough steps the canvas is fully denoised and becomes the committed output. Longer outputs are produced as several such blocks in sequence.

The practical consequence: generation is **parallel within a block** and **not left-to-right**. The model can lay down a token near the end of the canvas before it has filled the middle, because its confidence about that token doesn't depend on left-to-right reading order.

<img src="/assets/posts/diffusiongemma/generation-order.svg" alt="Two panels contrasting generation order. Left, autoregressive: across steps 1, 3, 5 the block fills strictly left to right, one new token (highlighted green) appended at the right end each step — 'the', then 'the sky is', then 'the sky is so blue'. Order is fixed. Right, diffusion: the same five-slot block starts fully masked at step 1; by step 6 the two ends ('the' and 'blue') are revealed in green while the middle is still masked and 'is' sits as a purple draft; by step 11 the whole block is committed. Positions fill by confidence, in any order, so the ends can lock before the middle." style="max-width: 560px; margin: 2em auto; display: block;">

DiffusionGemma is a 26B-parameter mixture-of-experts model with roughly 4B parameters active per token — the "26B-A4B" in its name. MoE means most of those 26B weights sit idle for any given token; a router picks a small subset of experts to actually run, so you pay download and memory for 26B but compute closer to 4B. In bf16 the weights need about 55 GB of VRAM; quantized to 4-bit they fit in roughly 13 GB.

## What the visualizer shows

The visualizer wraps the model in a Gradio app and renders every denoising step as a frame. Both backends expose the intermediate canvas at each step, so what you see is the model's actual internal state mid-denoise, not a replay. The color coding is the key to reading it:

<img src="/assets/posts/diffusiongemma/legend.png" alt="Color legend for the denoising canvas: gray block glyphs are still-masked noise, green tokens were just revealed this step, purple tokens are drafts from earlier steps not yet committed, white text is committed output." style="max-width: 520px; margin: 2em auto; display: block;">

- **Gray `░`** — still noise. A masked position the model hasn't revealed yet.
- **Green** — revealed *this* step. These are the tokens the model just became confident about.
- **Purple** — draft tokens from earlier steps, on the canvas but not yet committed.
- **White** — committed output. Locked in.

Watch the green flickering around the canvas and you're watching the model's confidence order directly. The green doesn't sweep left-to-right like a cursor; it lands wherever the model is most sure, then the purple drafts settle, then a block commits to white.

## The interesting part: scaffolding before content

Here's what changed my intuition. Run a *structured* prompt — one with constraints on form, not just content — and you can watch the model lay down the scaffolding before it fills in the substance. The constraint markers appear early, as anchors, and the free text denoises around them.

<img src="/assets/posts/diffusiongemma/scaffolding.svg" alt="The acrostic, schematically. Left, an early denoising step: six rows, each headed by a green letter cell spelling O, C, E, A, N, S downward, with the rest of every line still masked. An arrow labelled 'denoise' points right to the final state: the same six letters now head fully filled-in lines of text. The constraint letters land first as fixed anchors; each line's words fill in around its letter." style="max-width: 540px; margin: 2em auto; display: block;">

The acrostic above is the cleanest example: the O/C/E/A/N/S line-starts show up before the lines they head. The model is effectively committing to the skeleton of the answer and then solving the much easier sub-problem of "write a plausible ocean line that starts with C" against fixed anchors. An autoregressive model has no equivalent move — it would have to plan the acrostic implicitly and hope each line's first token landed right as it streamed past.

The code prompt makes the same point in a different register:

<video src="/assets/posts/diffusiongemma/denoise-code.mp4" autoplay loop muted playsinline style="max-width: 640px; width: 100%; margin: 2em auto; display: block; border-radius: 12px;"></video>

Asked for *"a Python function `is_palindrome(s)` with a docstring and three doctest examples,"* the model denoises a *skeleton* first — the `def` line, the docstring quotes, the `>>>` doctest prompts — and then fills the bodies. The structure of a correct answer appears before its details, which is much closer to how a person writes code than how an autoregressive model emits it.

The other demo prompts are chosen for the same reason — each one has structure that becomes visible as scaffolding:

| Prompt | Scaffolding that appears early |
|---|---|
| Acrostic ocean poem (O, C, E, A, N, S) | The six line-start letters, before the lines |
| "Why is the sky blue? In exactly three sentences." | Sentence boundaries / the three-sentence shape |
| `is_palindrome(s)` with docstring + doctests | `def` / docstring / `>>>` skeleton before bodies |
| Eight planets, one per line, each a fun fact | List markers across the whole block at once |
| 100-word story that begins and ends with the same sentence | Both fixed endpoints, before the middle exists |
| Haiku about ML + explanation of its 5-7-5 structure | The three-line haiku shape |

The story prompt is the one I find most striking: when a task requires the first and last sentence to match, the model can pin *both* ends of the canvas before the middle has been written at all. That's a generation order an autoregressive model structurally cannot produce.

I want to be careful here. I'm describing what the canvas *shows* — the order in which positions get revealed on these prompts — not making a claim about the model's quality, its accuracy versus other models, or its speed.

## Running it yourself

The model is [`google/diffusiongemma-26B-A4B-it`](https://huggingface.co/google/diffusiongemma-26B-A4B-it) (Apache-2.0, ungated), and the visualizer is on GitHub at [alainbrown/diffusion-visualizer](https://github.com/alainbrown/diffusion-visualizer). It has two backends.

**NVIDIA, via `transformers`.** The app drives the model's `TextDiffusionStreamer`, which hands back the full draft canvas at every denoising step and the committed tokens once a block locks in. It defaults to 4-bit quantization (~13 GB), which fits a 24 GB card; drop to 8-bit on a 48 GB card or run full precision (~55 GB) on an A100/H100 for best quality. It runs under Docker with one command.

**Apple silicon, via MLX.** No NVIDIA GPU needed. On an Apple-silicon Mac you can run the real model natively using the pre-quantized 4-bit checkpoint [`mlx-community/diffusiongemma-26B-A4B-it-4bit`](https://huggingface.co/mlx-community/diffusiongemma-26B-A4B-it-4bit) (~16.6 GB download — it fits a 24 GB Mac). This path uses `mlx-vlm`'s `stream_generate` with `diffusion_show_unmasking=True`, which surfaces the same per-step canvas. This is the backend I ran the videos above on, locally on a Mac. (It runs on the host, not in Docker — Docker Desktop on macOS has no Metal GPU access.)
Both backends, the Docker setup, and the Gradio app are in the [repo](https://github.com/alainbrown/diffusion-visualizer) — clone it, point it at a GPU or an Apple-silicon Mac, and the demo prompts above are one click away.

## Why watching it matters

You can read the sentence "diffusion language models generate in parallel, not left-to-right" and nod, and still carry around an autoregressive mental model where text is produced like a typewriter. Watching the acrostic letters appear before their lines, or both ends of a story pin themselves before the middle exists, breaks that intuition in a way a sentence can't. The model isn't typing faster — it's solving the problem in a different order, committing to the shape of an answer and then resolving the details against it.

That's the part worth seeing for yourself. Pick a prompt with structure, hit denoise, and watch where the green lands.
