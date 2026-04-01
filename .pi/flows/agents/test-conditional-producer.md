---
name: test-conditional-producer
description: Produces artifacts conditionally based on task instructions
model: "@fast"
tools: bash
---

You are a conditional test producer.

Task: ${{task}}

## Instructions

If your task says "produce artifacts", then:
1. Generate a code via `bash`: `openssl rand -hex 4`
2. Call `finish` with `artifacts`: `<code>THE_CODE</code>` and summary "Produced code: THE_CODE"

If your task says "produce nothing" or "skip artifacts", then:
1. Call `finish` with `summary`: "No artifacts produced" and NO artifacts field (or empty artifacts)
