---
title: "Training efficiency: a modern AI primer for everyone"
date: 2026-03-19
description: "Understanding the GPT-2 speedrun — from 45 minutes to 90 seconds — through the lens of systems engineering."
image: /assets/og/modern-ai-primer.png
ai_disclosure: "Written with Claude. I wrote the ideas and structure; Claude helped refine the prose."
---

OpenAI recently launched [Parameter Golf](https://openai.com/index/parameter-golf/) — a challenge to train the best language model that fits in 16 MB and trains in 10 minutes on 8 H100 GPUs, with $1 million in compute credits on the line. As they put it:

> "We're excited to see how optimizing for a parameter-constrained setting pushes people toward unique architectures (test-time compute, aggressive parameter tying, depth recurrence, low-rank training, ...)..." — OpenAI, [Parameter Golf announcement](https://openai.com/index/parameter-golf/)

Friends kept asking me: what does any of this mean? What are parameters? What's a transformer? Why does training efficiency matter? These are deeply technical people — systems engineers, backend developers, infrastructure architects — who could understand this domain if someone explained it without the jargon barrier.

This post is my attempt. It's structured around the GPT-2 speedrun, the community effort that best illustrates why training efficiency is one of the most exciting engineering problems in AI right now.

---

In May 2024, Andrej Karpathy published [llm.c](https://github.com/karpathy/llm.c) — a training implementation for GPT-2 (Generative Pre-trained Transformer 2, OpenAI's 2019 language model) in ~4,000 lines of C and CUDA. No Python. No PyTorch. Just raw GPU kernels training a 124-million-parameter model on 10 billion tokens — chunks of text, roughly word-sized — in 45 minutes on 8 H100 GPUs.

Then the speedrunning started.

Keller Jordan forked the project into [modded-nanogpt](https://github.com/KellerJordan/modded-nanogpt) and opened it up as a competition: train the same model to the same quality, as fast as possible. Contributors piled in — researchers, engineers, GPU kernel hackers. Over 77 records, they brought the time down to **1 minute 26 seconds** using fewer than 400 million tokens instead of 10 billion.

Same quality. Same hardware. 31x faster. 25x less data. The model doesn't know the difference.

## Why this matters

Training a language model is expensive. GPT-4-class models cost tens of millions of dollars in compute. When someone finds a way to train 31x faster on the same hardware, that's not an incremental improvement — it's a fundamental shift in who gets to participate.

The GPT-2 speedrun is a controlled experiment: fixed model size, fixed hardware, fixed quality bar. The only variable is the training algorithm. That makes it a clean benchmark for a question that matters at every scale: how much intelligence can you extract per dollar of compute?

> "GPT-2 is the grand-daddy of LLMs, the first time that the modern LLM stack came together in a recognizably modern form." — Andrej Karpathy, [llm.c discussion #481](https://github.com/karpathy/llm.c/discussions/481)

Karpathy's original llm.c trained GPT-2 (124M) in 45 minutes on 8 H100s — or 90 minutes on the older A100s, about $20 on Lambda Labs. The modded-nanogpt community did it in under 90 seconds on the same H100 hardware.

The 31x speedup didn't come from a PhD thesis. It came from the same techniques you'd use to optimize a database.

## What the model is actually doing

A language model predicts the next word. Text is first split into tokens — roughly word-sized chunks, where common words like "the" are a single token and longer words like "optimization" might become "optim" + "ization." Given a sequence of tokens, the model assigns probabilities to every possible next token, picks the most likely one, appends it, and repeats.

Training adjusts the model's internal numbers — its [parameters](#parameters) — until those predictions become good. GPT-2 has 124.5 million of them. Each parameter is a number in a matrix; the model is essentially a chain of matrix multiplications with nonlinear functions in between. If you're comfortable with linear algebra, you already understand the computational core.

<img src="/assets/posts/modern-ai-primer/inference-loop.svg" alt="Inference loop: input tokens pass through the transformer, which outputs a probability distribution over next tokens. The highest-probability token is selected and appended to the input, then the process repeats." style="max-width: 520px; margin: 2em auto; display: block;">

**The training loop** is a tight inner loop that runs thousands of times:

1. **Forward pass** — feed a batch of text through the model, get predictions
2. **Loss computation** — measure how wrong those predictions were ([cross-entropy loss](#cross-entropy-loss): if the model gave the correct next word a 90% probability, that's low loss; if it gave 1%, that's high loss)
3. **Backward pass** — compute [gradients](#gradients) for all 124 million parameters (how much did each one contribute to the error?)
4. **Update** — nudge the parameters in the direction that reduces loss

<img src="/assets/posts/modern-ai-primer/training-loop.svg" alt="Training loop: forward pass, compute loss, backward pass, update parameters, repeat ~20,000 times." style="max-width: 520px; margin: 2em auto; display: block;">

The llm.c baseline ran this loop ~20,000 times, processing 0.5 million tokens per iteration. Each iteration took about 43.5 milliseconds. The entire speedrun is about making this loop faster, smarter, or both.

Each step moves the model downhill on its loss landscape — a surface in 124-million-dimensional space where your altitude is how wrong the model is. Early in training, the slopes are steep and progress is fast. Later, near a minimum, the gradients flatten out and each step has to be more careful.

<img src="/assets/posts/modern-ai-primer/loss-landscape.svg" alt="Loss landscape: gradient descent follows the slope downhill. Steep gradients early mean big steps; shallow gradients near convergence mean small steps." style="max-width: 460px; margin: 2em auto; display: block;">

**The architecture** is a [transformer](#transformer) — a stack of 12 identical layers. Before entering the stack, each token is converted into an embedding: a dense vector of 768 numbers that represents the token's meaning in a continuous space. The word "king" and "queen" end up with similar embeddings because they appear in similar contexts. This conversion from a discrete symbol to a continuous vector is what lets the model do math on language.

Each layer contains two operations:

- [**Attention**](#attention) — each token looks at all previous tokens and decides which ones matter. You can think of this as a learned database query: "given where I am in this sentence, which previous positions should I weight heavily?" GPT-2 runs 12 of these queries in parallel per layer ([attention heads](#attention-heads)), each learning to track a different type of relationship.
- [**MLP**](#mlp) — a feed-forward network that processes what attention found. If attention is the query, the MLP is the computation you run on the results. This is where the model stores factual knowledge.

Here's what attention looks like concretely. When the model processes "the cat sat on", the token "sat" needs to figure out which earlier tokens are relevant for predicting what comes next. It computes a weight for each previous token — how much to pay attention to it — then blends their representations together:

<img src="/assets/posts/modern-ai-primer/attention-weights.svg" alt="Attention weights: the token 'sat' assigns weights to all previous tokens. 'cat' gets the highest weight (0.62) because it's most relevant for predicting what follows." style="max-width: 500px; margin: 2em auto; display: block;">

The model learns these weights from data. Nobody programs "pay attention to the subject noun" — it discovers that pattern because it helps predict the next word.

Each layer's output is added back to its input via a [residual connection](#residual-connection) — a skip wire that gives information a direct highway through the network:

<img src="/assets/posts/modern-ai-primer/residual-connection.svg" alt="Residual connection: the layer's input x is added to the layer's output, so output = layer(x) + x. Even if the layer learns nothing useful, x passes through unchanged." style="max-width: 440px; margin: 2em auto; display: block;">

Without residual connections, deep networks are nearly impossible to train. The gradient signal would decay to nothing before reaching the early layers — a problem called vanishing gradients. The skip connection gives gradients a direct highway back through the network, so every layer gets a useful learning signal regardless of depth.

The full architecture stacks 12 of these layers, each with its own attention and MLP, each connected by residual skip wires:

<img src="/assets/posts/modern-ai-primer/transformer-stack.svg" alt="Transformer architecture: 12 layers stacked, each containing an attention block and an MLP block, with residual skip connections around each layer." style="max-width: 400px; margin: 2em auto; display: block;">

## The rules

The speedrun has strict constraints. You can't just throw more hardware at it.

| Parameter | Value |
|---|---|
| Model | 124M parameters (GPT-2 architecture) |
| Hardware | 8x NVIDIA H100 GPUs |
| Target | ≤3.28 cross-entropy loss on FineWeb (curated web text) validation set |
| Data constraint | Cannot modify the train/validation data pipeline |
| Statistical bar | p<0.01 significance for ML-related changes |

Each new record must run faster than the prior record on identical hardware. The metric is wall-clock time from cold start to reaching the target validation loss. No tricks, no special data, no extra GPUs.

## The optimizations

Seventy-seven records. Forty-five minutes to ninety seconds. Here's how.

### Architecture: stop computing things that don't help

The original GPT-2 wastes parameters learning things that can be computed for free.

**Rotary embeddings** — GPT-2 uses a learned lookup table to tell the model "this token is at position 47." That table has to be trained from scratch, and it takes thousands of steps before the model develops a useful sense of position. [Rotary Position Embeddings](#rotary-embeddings-rope) (RoPE) replace this with a mathematical encoding: rotate the query and key vectors by an angle proportional to their position. The dot product between two tokens then naturally encodes their distance. Position understanding goes from "something the model has to learn" to "something it gets for free on step one."

**ReLU² activations** — GPT-2's [MLP](#mlp) layers use [GELU](#gelu), a smooth activation function where almost every neuron outputs a nonzero value. [ReLU²](#relu²) (`max(0, x)²`) is blunt by comparison — most outputs are exactly zero. That sparsity turns out to be a feature, not a bug. Fewer active neurons means fewer numbers to carry forward, which both speeds up computation and acts as implicit regularization. The model is forced to be selective about what it activates.

**Sliding window attention** — Standard attention lets every token attend to every previous token. That's O(n²) in sequence length. Inspired by [Gemma 2](https://arxiv.org/abs/2408.00118), some layers were switched to attend only to a local window of recent tokens. Global context is still available through the layers that retain full attention. You'd never run a full table scan when an index covers the query. Same idea.

**Dropping the first MLP** — Record #30 was one line of code: remove the MLP from the first transformer layer. The first layer's attention is already mixing token representations, and the MLP at that stage adds parameters without proportional benefit. Fewer parameters, less compute, same quality.

This is the kind of optimization you only find by questioning assumptions. Nobody proved the first MLP was unnecessary — someone just tried deleting it.

### Optimizers: extracting more learning per step

The biggest gains came not from changing the model, but from changing how it learns.

**Muon** — [Adam](#adam), the standard optimizer, maintains running averages of each gradient and its magnitude. It's behind almost every model you've used, and it's excellent — but each update direction isn't guaranteed to be maximally informative. [Muon](#muon) orthogonalizes gradient updates, forcing each step to be non-redundant with prior steps. Think of it as deduplicating the learning signal: if you've already stepped in one direction, Muon ensures the next step carries genuinely new information.

More learning per step means fewer steps to reach the target.

The speedrun interleaved Adam and Muon — Adam for embeddings (where its adaptive learning rate helps), Muon for attention and MLP weights (where orthogonality helps). Picking the right optimizer per parameter group is like picking the right data structure per access pattern.

**Momentum warmup** — Rather than starting with the optimizer's full momentum, the speedrun ramped it up gradually over the first few steps. Early gradients are noisy — the parameters are random and the loss landscape is chaotic. Full momentum amplifies that noise. Warmup lets the optimizer build up reliable signal before committing to fast moves.

**Batch size scheduling** — Small batches early, large batches later. Early in training, the loss landscape has clear, steep gradients — you don't need a precise estimate to know which way is downhill, so small noisy batches are fine and fast. Later, near a minimum, the gradients are subtle and you need larger batches for a stable signal. This is simulated annealing applied to batch size: high temperature exploration first, low temperature exploitation after.

### Kernels: making the GPU do more per cycle

These optimizations didn't change *what* was computed, just *how fast*. If you've ever profiled a hot loop and removed unnecessary memory allocations, this section will feel familiar.

**Flash Attention 3** — Attention involves computing a matrix of scores (every token against every other token), applying softmax (the function that turns raw scores into probabilities that sum to 1), then multiplying by values. Naively, this requires materializing the full n×n attention matrix in GPU HBM (high bandwidth memory — big but slow). [Flash Attention](https://arxiv.org/abs/2205.14135) fuses these operations into a single kernel that tiles the computation into blocks that fit in SRAM (small but fast), never materializing the full matrix.

You'd never write a database join that materializes the full cross product before filtering. Flash Attention is the same insight applied to matrix math. Version 3 adds H100-specific tensor core scheduling.

**Fused kernels** — A typical MLP forward pass involves separate GPU kernel launches for the linear transform, the activation function, and dropout. Each launch has overhead (~5-10μs), and each intermediate result gets written to HBM and read back. The speedrun fused these into single kernels — one launch, no intermediate memory round-trips. Custom [Triton](#triton) kernels handled:

- Linear + ReLU² in a single pass
- Softcapped cross-entropy with optimized numerics
- Symmetric matmul for MLP operations

This is loop fusion from compiler optimization, applied manually at the GPU kernel level.

**FP8 matmul** — H100 GPUs have dedicated [FP8](#fp8) tensor cores that run at 2x the throughput of [BFloat16](#bfloat16). The speedrun used FP8 for the final classification layer — the single most expensive matrix multiply — with asymmetric logit rescaling to compensate for the reduced precision. Same hardware, twice the throughput on the hottest operation. This is the GPU equivalent of switching a critical inner loop to SIMD instructions.

**Overlapped communication** — On 8 GPUs, gradients must be synchronized after each backward pass. The standard [all-reduce](#all-reduce) waits until all gradients are computed, then synchronizes everything at once. The speedrun replaced this with reduce-scatter and overlapped the communication with computation — while GPU 0 is computing gradients for layer 5, it's simultaneously sending layer 6's gradients to the other GPUs.

Classic latency hiding. The same technique that makes CPU prefetching and network pipelining fast.

### Data: getting more signal per byte

The baseline trained on 10 billion tokens. The current record uses fewer than 400 million. Some of that reduction comes from better optimizers extracting more learning per step — but a surprising amount comes from simply removing tokens that were teaching the model nothing.

**End-of-sequence alignment** — Training data is a stream of concatenated documents. Naively splitting this stream into fixed-length sequences means some sequences span document boundaries — the model tries to predict the first token of a new document based on the last paragraph of the previous one. That's noise, not signal. Aligning batch boundaries with end-of-sequence tokens eliminates this wasted capacity.

**Maximum document length constraints** — Documents longer than 2,048 tokens were truncated. A 12-layer, 768-dimension model can't meaningfully learn from very long-range dependencies. Including those tokens dilutes the training signal — the model spends capacity on predictions it can't possibly get right. Removing them effectively increases the information density of each batch.

## The progression

| Record | Time | Date | Speedup |
|---|---|---|---|
| #1 (llm.c baseline) | 45:00 | May 2024 | 1x |
| #10 | 7:48 | Nov 2024 | 5.8x |
| #20 | 2:59 | Jan 2025 | 15x |
| #40 | 2:21 | Oct 2025 | 19x |
| #60 | 1:46 | Jan 2026 | 25x |
| #77 (current) | 1:26 | Mar 2026 | 31x |

The first 10 records contributed the most — 45 minutes to under 8 minutes — from low-hanging fruit: a modern optimizer, better attention kernels, architecture cleanup. After that, each improvement got harder. The gap between records #60 and #77 is 20 seconds, won through increasingly creative ideas like replacing partitioned hyperconnections with single saved activations, tuning value embedding layouts, and fusing the softcapped entropy kernel.

This is the shape of every optimization effort. The first pass finds the obvious wins. The second pass requires real insight. The third pass requires obsession.

## What this tells us

**The 31x speedup is an engineering story.** Memory access patterns, kernel fusion, communication overlap, data pipeline optimization. Not a new theorem. Not a new architecture. The same techniques you'd apply to any performance-critical system. The barrier to understanding modern AI training is not intelligence — it's exposure.

**Algorithms compress compute.** The baseline used 10 billion tokens. The current record uses fewer than 400 million. Better optimizers and architecture choices extract more learning per token, and that ratio is the real efficiency metric. When the next generation of models costs $100 million to train, a 25x reduction in token requirements is the difference between one organization affording it and fifty.

**The stack is surprisingly shallow.** Karpathy's llm.c is 4,000 lines of C and CUDA. The modded-nanogpt speedrun is a single Python file. The core ideas — attention, gradients, optimization — are accessible to anyone comfortable with linear algebra and systems programming.

This is why Parameter Golf exists — and why it matters beyond the leaderboard. The techniques in this post aren't historical curiosities. They're the playbook. If you can read C, you can read [llm.c](https://github.com/karpathy/llm.c). If you can read Python, the entire modded-nanogpt speedrun is [a single file](https://github.com/KellerJordan/modded-nanogpt). The barrier was never ability. It was knowing where to look.

---

## Glossary

<span id="parameters"></span>
**Parameters** — The learnable numbers inside a model. Every weight in every matrix is a parameter. GPT-2 (124M) has 124.5 million of them. More parameters means more capacity to learn patterns.

<span id="cross-entropy-loss"></span>
**Cross-entropy loss** — When the model predicts the next token, it assigns probabilities to every possible answer. If the correct answer was "the" and the model gave it 90% probability, that's low loss (good). If it gave 1%, that's high loss (bad). Mathematically: `-log(probability of correct answer)`. The speedrun target is ≤3.28.

<span id="gradients"></span>
**Gradients** — The slope of the loss with respect to each parameter. If you have 124 million parameters, you compute 124 million slopes — one per parameter — answering "if I nudge this number, does the loss go up or down, and by how much?" Collectively, they form a vector pointing uphill. You step the opposite direction.

<span id="training-step"></span>
**Training step** — One cycle of: grab a batch of text, forward pass, compute loss, backward pass, update parameters. The llm.c baseline takes ~43.5ms per step.

<span id="transformer"></span>
**Transformer** — The model architecture used by GPT, Claude, and most modern language models. A stack of layers, each containing attention and an MLP, connected by residual connections. Introduced in the 2017 paper ["Attention Is All You Need"](https://arxiv.org/abs/1706.03762).

<span id="attention"></span>
**Attention** — The mechanism by which each token looks at all previous tokens and decides which are relevant. Computes a weighted sum of previous token representations, where the weights are learned based on content. If you think of it as a database: each token runs a learned query against all previous tokens and aggregates the results.

<span id="attention-heads"></span>
**Attention heads** — Each attention layer runs multiple independent attention computations in parallel (12 heads in GPT-2). Each head can learn to attend to different types of relationships — one might track syntactic structure, another might track semantic similarity. Analogous to having multiple indexes on a database table.

<span id="mlp"></span>
**MLP (Multi-Layer Perceptron)** — A feed-forward network within each transformer layer. Takes the output of attention, projects it to a higher dimension (4x in GPT-2), applies a nonlinear activation function, and projects it back. This is where the model stores and retrieves factual knowledge.

<span id="residual-connection"></span>
**Residual connection** — A skip wire that adds each layer's input to its output: `output = layer(x) + x`. Prevents information loss in deep networks by giving gradients a direct highway back through the network. Without them, deep networks are nearly impossible to train.

<span id="adam"></span>
**Adam** — The optimizer behind almost every model you've used. Maintains two running averages per parameter: the mean gradient (momentum) and the mean squared gradient (adaptive learning rate). Confident when gradients consistently point the same direction, cautious when they're noisy.

<span id="muon"></span>
**Muon** — An optimizer that orthogonalizes gradient updates so each step is maximally informative and non-redundant with previous steps. Uses Newton-Schulz iteration (later replaced by "Polar Express") to project gradients onto an orthogonal basis. More learning per step than Adam, at the cost of additional computation per update.

<span id="rotary-embeddings-rope"></span>
**Rotary embeddings (RoPE)** — A method for encoding token positions by rotating query and key vectors in attention. The rotation angle is proportional to position, so the dot product between two tokens naturally encodes their distance. Replaces learned position lookup tables. Used in LLaMA, Gemma, and most modern architectures.

<span id="gelu"></span>
**GELU** — Gaussian Error Linear Unit. The activation function used in the original GPT-2. A smooth approximation of ReLU that doesn't have a hard zero cutoff — small negative inputs produce small negative outputs rather than exactly zero.

<span id="relu²"></span>
**ReLU²** — The square of ReLU: `max(0, x)²`. Produces sparser outputs than GELU (more exact zeros) and stronger activation for positive inputs. The sparsity acts as implicit regularization and can speed up downstream computation.

<span id="triton"></span>
**Triton** — A Python-based language for writing GPU kernels, developed by OpenAI. Sits between CUDA (low-level, maximum control) and PyTorch (high-level, automatic but not always optimal). Lets you write fused kernels without managing thread blocks and shared memory manually.

<span id="flash-attention"></span>
**Flash Attention** — An algorithm that computes attention without materializing the full attention matrix in GPU memory. Tiles the computation into blocks that fit in SRAM (fast, small) rather than HBM (slow, large). Reduces attention from memory-bound to compute-bound, typically 2-4x faster with significant memory savings.

<span id="bfloat16"></span>
**BFloat16** — A 16-bit floating point format that keeps the same exponent range as float32 (8 bits) but reduces the mantissa to 7 bits. This means it can represent the same range of values (no overflow/underflow) but with less precision. The standard training precision for modern models — 2x throughput vs float32 with minimal quality impact.

<span id="fp8"></span>
**FP8** — An 8-bit floating point format supported by H100 GPUs. Two variants: E4M3 (more precision, less range) and E5M2 (more range, less precision). 2x throughput vs BFloat16 on tensor cores. Requires careful scaling to avoid overflow.

<span id="all-reduce"></span>
**All-reduce** — The standard communication pattern for synchronizing gradients across multiple GPUs. Each GPU ends up with the sum of all GPUs' gradients. The speedrun replaced this with reduce-scatter (each GPU gets 1/Nth of the summed gradients) followed by all-gather, which allows overlapping communication with computation.
