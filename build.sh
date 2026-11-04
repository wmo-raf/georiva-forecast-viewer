#!/bin/bash
# Intentionally empty. The plugin installer (core's ADR 0035) runs no hooks and
# refuses a plugin whose build script holds commands; the web bundle is built by
# CI and committed before a release is tagged.
set -euo pipefail
