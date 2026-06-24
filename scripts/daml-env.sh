#!/usr/bin/env bash
# Source this to put the local Daml 2.10.4 toolchain + JDK 17 on PATH for the current shell:
#   source scripts/daml-env.sh
# These are no-admin, user-local installs created during Phase 0 (see docs/ARCHITECTURE.md).
# Adjust the paths if the toolchain lives elsewhere on your machine.

export JAVA_HOME="${JAVA_HOME:-/c/Users/DELL 5420/toolchain/jdk-17.0.19+10}"
DAML_SDK_BIN="/c/Users/DELL 5420/AppData/Roaming/daml/sdk/2.10.4/daml"
export PATH="$DAML_SDK_BIN:$JAVA_HOME/bin:$PATH"

echo "daml-env: JAVA_HOME=$JAVA_HOME"
daml.exe version 2>/dev/null | head -3 || echo "daml not found on PATH"
