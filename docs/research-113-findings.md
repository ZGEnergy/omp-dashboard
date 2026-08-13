# Research 113 Findings: Extension Startup Load Optimization

## Summary
Issue 113 investigates OMP extension startup load latency.
Static import of mdns-discovery eager-loads bonjour-service during OMP boot.
Deferring mdns-discovery import to session_start removes bonjour-service from extension load phase.

## Question 1: Bridge vs 6 Other Extensions
Issue benchmark disables seven extensions simultaneously.
Dashboard repository contains bridge extension only.
Repository lacks source for six external extensions.
Headless subagent environment prevents interactive PTY OMP harness execution.
Interactive PTY multi-extension benchmarks marked not re-run in headless subagent.
Bridge module evaluation requires 224.68 ms mean timing under Node 22.
Bridge module accounts for portion of 1.2 s total extension boot delay.

## Question 2: Bonjour vs Config, Role, YAML, Remaining Imports
Benchmark measures isolated module evaluation times across five runs.
Bonjour-service requires 10.91 ms median (10.66 ms mean).
Mdns-discovery requires 14.75 ms median (14.76 ms mean).
Yaml requires 21.03 ms median (21.94 ms mean).
Config requires 4.48 ms median (4.73 ms mean).
Role-manager requires 34.55 ms median (34.56 ms mean).
Bridge total evaluation requires 224.68 ms mean.
Deferring mdns-discovery saves 14.75 ms mdns evaluation during initial bridge load.
Role-manager and yaml remain factory-time dependencies for role definitions.

## Question 3: Node/Bun Inspector and Module Trace Capabilities
Node supports --cpu-prof, --inspect, --trace-warnings flags.
Bun supports --inspect and --profile flags.
OMP CLI wrapper strips profiling flags before extension process launch.
Script scripts/measure-module-eval.js bypasses wrapper limitations via direct subprocess import timing.
Direct subprocess timing provides accurate per-module evaluation data.
