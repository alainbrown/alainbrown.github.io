---
title: "I replaced my terminal app with a text file"
date: 2026-03-15
description: "Comparing a 2,500-line TypeScript CLI to a 230-line Claude Code skill that does the same thing."
---

I built [stack-agent](https://github.com/alainbrown/stack-agent) — an AI-powered CLI that helps developers scaffold full-stack applications. It has a custom fullscreen terminal UI built with React and Ink, its own LLM client with streaming and message caching, a stage-based state machine with cascading invalidation, and 176 tests. It took about a day to build.

Then I replaced it with a 230-line markdown file.

## What stack-agent does

Think `create-next-app`, but for the entire stack. You describe your project, it recommends technologies for each layer (frontend, backend, database, auth, payments, AI, deployment), walks you through each decision with options and trade-offs, then scaffolds everything with connected boilerplate. The key feature: if you change your mind about frontend, it knows to re-evaluate backend and deployment. It's a state machine that keeps your stack internally consistent.

## The experiment

Modern code agents like claude code or open code have a concept called [skills](https://github.com/vercel-labs/skills) — markdown files with YAML frontmatter that tell the LLM how to behave for specific tasks. When a skill triggers, the llm reads the instructions and follows them. No custom UI, no separate process, no API client. Just the llm doing what the markdown says.

The question was: can a `SKILL.md` file capture enough of stack-agent's workflow to make the standalone app unnecessary?

## What translated well

**The recommendation table.** Stack-agent presents options in a custom TUI component with arrow-key selection. The skill presents a markdown table with numbered rows. Users type a number instead of pressing arrow keys. Functionally identical, zero code required.

**Stage-based flow.** Stack-agent has a `StageManager` class with methods like `navigateTo()`, `completeStage()`, and `skipStage()`. The skill has a paragraph that says "walk through each category, skip what isn't needed." The LLM figures out the rest.

**Scaffolding.** Stack-agent intercepts tool calls (`run_scaffold`, `add_integration`) and executes them with custom code. The skill says "run npx, write integration files, wire them together." Claude Code already has the tools to do this natively.

## What was harder

**Cascading invalidation.** This is stack-agent's signature feature. Change frontend from Next.js to Vite, and it automatically re-evaluates backend (was "skip — Next.js API routes") and deployment (was "Vercel for Next.js"). The app uses an LLM call to determine which stages to invalidate, with guardrails preventing upstream changes.

The first version of the skill hand-waved this: "If a decision affects downstream choices, flag it." That produced correct behavior 0% of the time in benchmarks — the baseline Claude Code said "everything else stays the same" when swapping Next.js for Vite, leaving the stack inconsistent.

The fix was being explicit. I added an invalidation rules section with concrete examples, the heuristic "check if the downstream decision's rationale references what changed," and guardrails. After that: 100% pass rate.

**State persistence.** Stack-agent compresses conversation history after each stage decision, keeping only a summary. This prevents earlier decisions from being lost as the conversation grows. Claude Code manages its own context window, and the skill can't control that.

The solution: write decisions to a `.stack-decisions.json` file after every change, read it before every stage. The file becomes durable state that survives context compression. Simple, but it took a benchmark failure to realize it was needed.

## The benchmarks

### How we tested

Each evaluation runs the same prompt twice — once with the skill loaded, once without (baseline Claude Code). Both runs are graded against a set of specific assertions: did it present a recommendation table? Did it generate a deploy script? Did it detect that changing frontend invalidates backend? Each assertion is binary pass/fail with evidence. The [skill-creator](https://github.com/anthropics/claude-code) tooling handles the parallel runs, grading, and aggregation.

We ran two iterations. The first tested normal scaffolding. The second stress-tested the features that differentiate the skill from vanilla Claude Code.

### Iteration 1: The happy path

Three evals covering the common cases — a user who knows their stack, a user who's vague, and a user building an internal tool.

| Eval | Prompt | With Skill | Without Skill |
|------|--------|-----------|---------------|
| Pre-decided stack | "Next.js, Postgres, deploy to Vercel" | 7/7 | 4/7 |
| Vague project | "scaffold me a recipe sharing site" | 7/7 | 2/7 |
| Internal dashboard | "ops dashboard with auth and Stripe webhooks" | 7/7 | 6/7 |

The vague prompt was the biggest gap. Without the skill, Claude made 10+ assumptions and started writing code immediately — no project name asked, no recommendation table, no review opportunity, no acknowledgment that payments and AI weren't needed. With the skill, it presented the full category table, explicitly marked irrelevant categories as skipped, and offered to review each decision before building.

The internal dashboard was the closest result. Baseline Claude produced solid code — auth, Stripe webhooks, database schema, all wired together. It only failed one assertion: it didn't recognize the "internal tool" context and cited SSR as a positive rather than acknowledging it wasn't needed for a dashboard.

One finding that surprised me: the `connected-boilerplate` assertion — checking whether generated files are wired together rather than isolated examples — passed for *both* configurations in every eval. Claude already writes connected code without being told. The skill doesn't improve code quality. It improves the decision process upstream of code.

### Iteration 2: The hard features

Iteration 1 looked good, but it only tested the happy path. The features that actually differentiate the skill — cascading invalidation and state persistence — were untested. So we added two targeted evals.

| Eval | With Skill | Without Skill |
|------|-----------|---------------|
| Cascading invalidation | 6/6 | 0/6 |
| State persistence | 6/6 | 0/6 |

The cascading invalidation test: accept initial recommendations (Next.js, skip backend, Vercel), then change frontend to Vite + React. The skill correctly identified that backend (was "skip — Next.js API routes") and deployment (was "Vercel for Next.js") were now invalid, reset them, and walked through re-deciding both. Baseline Claude said "everything else stays the same" — leaving NextAuth (Next.js-dependent), a nonexistent backend, and Vercel all inconsistent.

The state persistence test: simulate a long multi-turn conversation with multiple decision changes. The skill wrote `.stack-decisions.json` after every change (5 writes, 9 reads, 1 delete across 6 turns) and read it back before scaffolding. Baseline Claude persisted zero state to disk — all decisions existed only in conversation context, vulnerable to context compression.

### Aggregate

| Metric | With Skill | Without Skill |
|--------|-----------|---------------|
| Pass Rate | 33/33 (100%) | 12/33 (36%) |
| Avg Time | 199s | 185s |
| Avg Tokens | 34k | 28k |

The skill adds about 14 seconds and 6,000 tokens of overhead per eval — the cost of the recommendation table, stage review flow, and state file operations. The pass rate gap is 64 percentage points.

## What this means

The 2,500-line TypeScript application with its custom TUI, LLM client, streaming pipeline, and state machine was ultimately encoding a workflow. The skill encodes the same workflow in 230 lines of prose. The LLM provides the runtime.

This doesn't mean rich terminal applications are dead. Stack-agent's TUI is genuinely nice to use — arrow-key navigation, colored indicators, real-time streaming. The skill trades that polish for zero deployment overhead. They serve different users.

But it does suggest a shift in where developer tool complexity belongs. Instead of building custom UIs and state machines to guide an LLM through a workflow, you can describe the workflow in natural language and let the LLM interpret it. The instructions become the application.

> The skill is a 230-line specification. The LLM is the runtime. The conversation is the UI.

Whether that trade-off is worth it depends on your users. If they're already in Claude Code, the skill is strictly better — same workflow, no context switch. If they want a dedicated tool with a polished experience, the standalone app wins.

Both are [open source](https://github.com/alainbrown/stack-agent). The skill is installable as a [Claude Code plugin](https://github.com/alainbrown/stack-agent-skill).
