#!/bin/bash
set -e

# Use environment variables with defaults
PROXY_HOST="${PROXY_HOST:-__PROXY_HOST__}"
PROXY_PORT="${PROXY_PORT:-__PROXY_PORT__}"
PROXY_TYPE="${PROXY_TYPE:-__PROXY_TYPE__}"  # http or socks5
EXTENSION_PATH="${EXTENSION_PATH:-}"  # Current extension's exact path (optional)
PROXY_ADDR="${PROXY_HOST}:${PROXY_PORT}"

# ============================================================================
# Developer Diagnostics
# ============================================================================
# Set DEBUG=1 to enable verbose output: DEBUG=1 bash setup-proxy.sh
# ============================================================================

DEBUG="${DEBUG:-0}"

debug_log() {
    if [ "$DEBUG" = "1" ]; then
        echo "[DEBUG] $*"
    fi
}

echo "========================================"
echo "Antigravity SSH Proxy - Setup"
echo "========================================"
echo ""

# System info
ARCH=$(uname -m)
echo "[INFO] System Architecture: $ARCH"
echo "[INFO] Proxy Config: $PROXY_ADDR"
echo "[INFO] Proxy Type: $PROXY_TYPE"
if [ -n "$EXTENSION_PATH" ]; then
    echo "[INFO] Extension Path: $EXTENSION_PATH"
fi
echo ""

# Determine expected binary names based on architecture
case "$ARCH" in
    x86_64|amd64) 
        EXPECTED_BINARY="mgraftcp-fakedns-linux-amd64"
        EXPECTED_LIB="libdnsredir-linux-amd64.so"
        ;;
    aarch64|arm64) 
        EXPECTED_BINARY="mgraftcp-fakedns-linux-arm64"
        EXPECTED_LIB="libdnsredir-linux-arm64.so"
        ;;
    *) 
        EXPECTED_BINARY="mgraftcp-fakedns-linux-$ARCH"
        EXPECTED_LIB="libdnsredir-linux-$ARCH.so"
        ;;
esac

echo "[INFO] Expected Binary: $EXPECTED_BINARY"
echo "[INFO] Expected Library: $EXPECTED_LIB"
echo ""

# Scan for extension directories (sorted by version, newest first)
echo "[SCAN] Searching for extension directories..."
echo "       (Sorted by version - newest first, will be preferred)"
EXT_DIRS=$(ls -d "$HOME/.antigravity-server/extensions/"*antigravity-ssh-proxy* 2>/dev/null | sort -t'-' -k3 -V -r || echo "")
if [ -n "$EXT_DIRS" ]; then
    FIRST_EXT=true
    echo "$EXT_DIRS" | while read -r dir; do
        if [ "$FIRST_EXT" = true ]; then
            echo "  📦 $dir  ⬅️ PREFERRED (newest)"
            FIRST_EXT=false
        else
            echo "  📦 $dir"
        fi
        BIN_DIR="$dir/resources/bin"
        if [ -d "$BIN_DIR" ]; then
            echo "    └── resources/bin/"
            # List binaries
            for f in "$BIN_DIR"/*; do
                [ -e "$f" ] || continue
                fname=$(basename "$f")
                if [ -x "$f" ]; then
                    echo "      ├── $fname ✅ (executable)"
                else
                    echo "      ├── $fname"
                fi
            done
        else
            echo "    └── resources/bin/ ❌ NOT FOUND"
        fi
    done
else
    echo "  ⚠️  No extension directories found!"
fi
echo ""

# Scan for language servers
echo "[SCAN] Searching for language servers..."
LS_DIRS=$(find "$HOME/.antigravity-server/bin" -path "*/extensions/antigravity/bin" -type d 2>/dev/null || echo "")
if [ -n "$LS_DIRS" ]; then
    echo "$LS_DIRS" | while read -r dir; do
        echo "  📂 $dir"
        for f in "$dir"/language_server_linux_*; do
            [ -e "$f" ] || continue
            fname=$(basename "$f")
            if [[ "$fname" == *.bak ]]; then
                echo "    ├── $fname (backup - original binary)"
            elif head -1 "$f" 2>/dev/null | grep -q "^#!/bin/bash"; then
                # It's a wrapper script - analyze it
                if grep -q 'mgraftcp-fakedns' "$f" 2>/dev/null; then
                    echo "    ├── $fname ✅ (new wrapper with FakeDNS)"
                elif grep -q 'mgraftcp-linux' "$f" 2>/dev/null; then
                    echo "    ├── $fname ⚠️  (LEGACY wrapper - needs upgrade)"
                else
                    echo "    ├── $fname ❓ (wrapper - unknown type)"
                fi
                # Show proxy config in wrapper
                proxy_in_wrapper=$(grep -oP 'PROXY_ADDR="\K[^"]+' "$f" 2>/dev/null || echo "not found")
                echo "    │   └── Proxy: $proxy_in_wrapper"
            else
                echo "    ├── $fname (original binary)"
            fi
        done
    done
else
    echo "  ⚠️  No language server directories found!"
fi
echo ""
echo "========================================"
echo ""

# ============================================================================
# Legacy Wrapper Detection and Upgrade
# ============================================================================
# This function detects old wrapper scripts that use the wrong binary name
# (mgraftcp-linux-amd64 instead of mgraftcp-fakedns-linux-amd64) and upgrades
# them to the new version with FakeDNS support.
#
# Problem: Old versions of setup-proxy.sh created wrappers that look for:
#   - mgraftcp-linux-amd64 (without FakeDNS)
# But the new version needs:
#   - mgraftcp-fakedns-linux-amd64 (with FakeDNS for DNS pollution bypass)
# ============================================================================

detect_legacy_wrapper() {
    local wrapper="$1"
    
    # Check if this is a bash script (not the original binary)
    if ! head -1 "$wrapper" 2>/dev/null | grep -q "^#!/bin/bash"; then
        return 1  # Not a wrapper script
    fi
    
    # Check for legacy patterns that indicate an old wrapper
    # Pattern 1: Uses mgraftcp-linux-amd64 without fakedns
    if grep -q 'mgraftcp-linux-amd64"' "$wrapper" 2>/dev/null && \
       ! grep -q 'mgraftcp-fakedns-linux-amd64' "$wrapper" 2>/dev/null; then
        return 0  # Legacy wrapper detected
    fi
    
    # Pattern 2: Hard-coded binary path (old style without dynamic find)
    if grep -q 'MGRAFTCP_PATH=".*mgraftcp-linux' "$wrapper" 2>/dev/null && \
       ! grep -q 'find_binaries' "$wrapper" 2>/dev/null; then
        return 0  # Legacy wrapper with hard-coded path
    fi
    
    # Pattern 3: Missing libdnsredir configuration (very old wrappers)
    if grep -q 'mgraftcp' "$wrapper" 2>/dev/null && \
       ! grep -q 'libdnsredir\|GODEBUG.*netdns=cgo' "$wrapper" 2>/dev/null; then
        return 0  # Legacy wrapper without DNS redir support
    fi
    
    return 1  # Not a legacy wrapper
}

upgrade_legacy_wrapper() {
    local wrapper="$1"
    local backup="$2"
    
    echo "  [UPGRADE] Detected legacy wrapper script"
    
    # Extract old proxy address from the legacy script
    local old_proxy=""
    old_proxy=$(grep -oP 'PROXY_ADDR="\K[^"]+' "$wrapper" 2>/dev/null || \
                grep -oP '--http_proxy[= ]+\K[^ "]+' "$wrapper" 2>/dev/null || \
                grep -oP '--socks5[= ]+\K[^ "]+' "$wrapper" 2>/dev/null || \
                echo "")
    
    if [ -n "$old_proxy" ]; then
        echo "  [UPGRADE] Found old proxy config: $old_proxy"
    fi
    
    # Report what's being fixed
    if grep -q 'mgraftcp-linux-amd64"' "$wrapper" 2>/dev/null && \
       ! grep -q 'mgraftcp-fakedns' "$wrapper" 2>/dev/null; then
        echo "  [UPGRADE] Fixing: mgraftcp-linux-amd64 -> mgraftcp-fakedns-linux-amd64"
    fi
    
    if ! grep -q 'GODEBUG.*netdns=cgo' "$wrapper" 2>/dev/null; then
        echo "  [UPGRADE] Adding: GODEBUG=netdns=cgo for FakeDNS support"
    fi
    
    if ! grep -q 'find_binaries' "$wrapper" 2>/dev/null; then
        echo "  [UPGRADE] Adding: Dynamic binary discovery"
    fi
    
    # Remove the old wrapper - it will be replaced with a new one
    rm -f "$wrapper"
    
    # Use the new proxy address if provided, otherwise keep the old one
    if [ -n "$old_proxy" ] && [ "$PROXY_ADDR" = "__PROXY_HOST__:__PROXY_PORT__" ]; then
        PROXY_ADDR="$old_proxy"
        echo "  [UPGRADE] Using existing proxy address: $PROXY_ADDR"
    fi
    
    return 0  # Signal that wrapper was removed and needs to be recreated
}

UPGRADED_COUNT=0

# Find all language servers (there may be multiple versions)
TARGETS=$(find "$HOME/.antigravity-server/bin" -path "*/extensions/antigravity/bin/language_server_linux_*" -type f 2>/dev/null | grep -v ".bak$")
[ -z "$TARGETS" ] && echo "ERROR: language server not found" && exit 1

CONFIGURED_COUNT=0
SKIPPED_COUNT=0

# Process each language server found
while IFS= read -r TARGET; do
    [ -z "$TARGET" ] && continue
    
    echo "Processing: $TARGET"
BAK="${TARGET}.bak"

    # Check if already configured with correct proxy address AND type AND is a new-style wrapper
    if head -1 "$TARGET" 2>/dev/null | grep -q "^#!/bin/bash"; then
        # First check if it's a legacy wrapper that needs upgrading
        if detect_legacy_wrapper "$TARGET"; then
            upgrade_legacy_wrapper "$TARGET" "$BAK"
            UPGRADED_COUNT=$((UPGRADED_COUNT + 1))
            # Continue to create new wrapper below
        elif grep -q "PROXY_ADDR=\"$PROXY_ADDR\"" "$TARGET" 2>/dev/null && \
             grep -q "PROXY_TYPE=\"$PROXY_TYPE\"" "$TARGET" 2>/dev/null; then
            # New-style wrapper with correct proxy address and type - skip
            echo "  Already configured with $PROXY_ADDR ($PROXY_TYPE)"
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi
    fi

    # Create backup if needed
    if [ ! -f "$BAK" ]; then
        if head -1 "$TARGET" 2>/dev/null | grep -q "^#!/bin/bash"; then
            echo "  ERROR: target is script but no backup exists, skipping"
            continue
        fi
        mv "$TARGET" "$BAK"
        echo "  Backup created"
    fi

# Create wrapper script - dynamically find mgraftcp at runtime
# This ensures version upgrades don't break existing wrappers
cat > "$TARGET" << 'WRAPPER_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Proxy configuration - can be updated without replacing the wrapper
PROXY_ADDR="__PROXY_ADDR_PLACEHOLDER__"
PROXY_TYPE="__PROXY_TYPE_PLACEHOLDER__"  # http or socks5
EXTENSION_BIN_PATH="__EXTENSION_BIN_PATH_PLACEHOLDER__"  # Exact path to current extension's bin dir

# Dynamically find mgraftcp-fakedns and libdnsredir at runtime
find_binaries() {
    local arch=$(uname -m)
    local binary_name=""
    local lib_name=""
    case "$arch" in
        x86_64|amd64) 
            binary_name="mgraftcp-fakedns-linux-amd64"
            lib_name="libdnsredir-linux-amd64.so"
            ;;
        aarch64|arm64) 
            binary_name="mgraftcp-fakedns-linux-arm64"
            lib_name="libdnsredir-linux-arm64.so"
            ;;
        *) return 1 ;;
    esac
    
    # Method 1: Use exact extension path if provided (preferred)
    if [ -n "$EXTENSION_BIN_PATH" ] && [ -d "$EXTENSION_BIN_PATH" ]; then
        if [ -f "$EXTENSION_BIN_PATH/$binary_name" ]; then
            echo "$EXTENSION_BIN_PATH/$binary_name"
            if [ -f "$EXTENSION_BIN_PATH/$lib_name" ]; then
                echo "$EXTENSION_BIN_PATH/$lib_name"
            fi
            return 0
        fi
    fi
    
    # Method 2: Fallback - search in all versions (sorted by version, newest first)
    for dir in $(ls -d "$HOME/.antigravity-server/extensions/"*antigravity-ssh-proxy*/resources/bin 2>/dev/null | sort -t'-' -k3 -V -r); do
        if [ -f "$dir/$binary_name" ]; then
            echo "$dir/$binary_name"
            if [ -f "$dir/$lib_name" ]; then
                echo "$dir/$lib_name"
            fi
            return 0
        fi
    done
    return 1
}

# Get both paths
BINARIES=$(find_binaries)
MGRAFTCP_PATH=$(echo "$BINARIES" | head -1)
DNSREDIR_PATH=$(echo "$BINARIES" | tail -1)

if [ -z "$MGRAFTCP_PATH" ] || [ ! -f "$MGRAFTCP_PATH" ]; then
    # Fallback: run without proxy if mgraftcp not found
    exec "$SCRIPT_DIR/$SCRIPT_NAME.bak" "$@"
fi

chmod +x "$MGRAFTCP_PATH" 2>/dev/null || true

# Note: mgraftcp-fakedns now directly uses libdnsredir-linux-amd64.so
# No need to copy/rename - the binary finds it automatically

# Force Go programs to use cgo DNS resolver (required for LD_PRELOAD to work)
export GODEBUG="${GODEBUG:+$GODEBUG,}netdns=cgo"

# Select proxy argument based on proxy type
if [ "$PROXY_TYPE" = "socks5" ]; then
    exec "$MGRAFTCP_PATH" --socks5 "$PROXY_ADDR" "$SCRIPT_DIR/$SCRIPT_NAME.bak" "$@"
else
    # Default to http proxy
    exec "$MGRAFTCP_PATH" --http_proxy "$PROXY_ADDR" "$SCRIPT_DIR/$SCRIPT_NAME.bak" "$@"
fi
WRAPPER_EOF

# Replace placeholders with actual values
sed -i "s|__PROXY_ADDR_PLACEHOLDER__|$PROXY_ADDR|g" "$TARGET"
sed -i "s|__PROXY_TYPE_PLACEHOLDER__|$PROXY_TYPE|g" "$TARGET"
# Use EXTENSION_PATH if provided, otherwise leave as empty (will use fallback)
if [ -n "$EXTENSION_PATH" ]; then
    EXTENSION_BIN_DIR="$EXTENSION_PATH/resources/bin"
    sed -i "s|__EXTENSION_BIN_PATH_PLACEHOLDER__|$EXTENSION_BIN_DIR|g" "$TARGET"
else
    sed -i "s|__EXTENSION_BIN_PATH_PLACEHOLDER__||g" "$TARGET"
fi

chmod +x "$TARGET"
    echo "  Configured with proxy $PROXY_ADDR ($PROXY_TYPE)"
    CONFIGURED_COUNT=$((CONFIGURED_COUNT + 1))
done <<< "$TARGETS"

# Summary
echo ""
echo "========================================"
echo "Setup Summary"
echo "========================================"
if [ $UPGRADED_COUNT -gt 0 ]; then
    echo "  Upgraded:   $UPGRADED_COUNT (legacy wrappers updated)"
fi
if [ $CONFIGURED_COUNT -gt 0 ]; then
    echo "  Configured: $CONFIGURED_COUNT (new wrappers created)"
fi
if [ $SKIPPED_COUNT -gt 0 ]; then
    echo "  Skipped:    $SKIPPED_COUNT (already up-to-date)"
fi
echo "========================================"

TOTAL=$((CONFIGURED_COUNT + UPGRADED_COUNT))
if [ $TOTAL -gt 0 ]; then
    echo "Setup complete: proxy=$PROXY_ADDR"
elif [ $SKIPPED_COUNT -gt 0 ]; then
    echo "All wrappers already configured with $PROXY_ADDR"
else
    echo "ERROR: No language servers were configured"
    exit 1
fi
