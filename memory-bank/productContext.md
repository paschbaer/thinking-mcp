# Product Context — Thinking-MCP

> Why this project exists, the problems it solves, and how it is intended to be used.

## Problem

Coding agents (Copilot, Claude, Cline, …) often jump straight to code changes
without structured reasoning: no explicit plan, no root-cause analysis, no
stress-testing of conclusions. Existing "thinking" MCP servers expose only a
single sequential-thinking tool.

## Solution

A family of MCP servers that turn reasoning **methods** into callable tools:

- **Structured reasoning:** sequential thinking, mental models, debugging
  approaches, decision frameworks, scientific method, socratic method,
  structured argumentation, collaborative reasoning.
- **Visualization-based reasoning:** mind maps, concept maps, fishbone
  diagrams, SWOT, issue trees, visual reasoning.
- **Utility & orchestration:** assumption x-ray, comparative advantage,
  value-of-information, safe struggle designer, seven-seekers orchestrator,
  drag-point audit.
- **Session management:** inspect, export, and restore reasoning state so long
  tasks survive context compaction.

## Target Users

1. Developers configuring MCP clients that benefit from enforced reasoning
   workflows (this repo's own `AGENTS.md` is a working example).
2. Consumers installing `@paschbaer/clear-thought` via npm / Smithery / Docker.

## Usage Principle

- Facilitation-mode tools return **guiding questions** first; the agent answers
  them and re-calls the tool with content to get a real analysis.
- Tools return a `sessionContext` block with accumulated session stats — the
  guide (root `AGENTS.md`) instructs agents to read it, not duplicate it.
