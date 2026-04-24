#!/bin/bash
set -e

APP="lingcode"
INSTALL_DIR="${HOME}/.opencode/bin"

# =============================================================================
# 配置区域 - 请根据你的项目修改以下变量
# =============================================================================
GITHUB_OWNER="lingke-net"  # 替换为你的 GitHub 用户名或组织名
GITHUB_REPO="lingke-net/lingcode"  # 替换为你的仓库名
# =============================================================================

# CLI 参数
HELP=false
VERSION=""
BINARY_PATH=""
MODIFY_PATH=true

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      HELP=true
      shift
      ;;
    -v|--version)
      VERSION="$2"
      shift 2
      ;;
    -b|--binary)
      BINARY_PATH="$2"
      shift 2
      ;;
    --no-modify-path)
      MODIFY_PATH=false
      shift
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

if [ "$HELP" = true ]; then
  echo "安装 $APP"
  echo ""
  echo "用法:"
  echo "  curl -fsSL https://opencode.ai/install | bash"
  echo "  curl -fsSL https://opencode.ai/install | bash -s -- --version 1.0.180"
  echo ""
  echo "选项:"
  echo "  -h, --help              显示帮助"
  echo "  -v, --version <版本>    安装指定版本"
  echo "  -b, --binary <路径>     从本地二进制安装"
  echo "  --no-modify-path        不修改 PATH"
  exit 0
fi

# 检测操作系统和架构
detect_os() {
  case "$(uname -s)" in
    Darwin*)  echo "darwin" ;;
    Linux*)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)        echo "不支持的操作系统" >&2; exit 1 ;;
  esac
}

detect_arch() {
  local arch=$(uname -m)
  case $arch in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)             echo "不支持的架构: $arch" >&2; exit 1 ;;
  esac
}

OS=$(detect_os)
ARCH=$(detect_arch)

# 检测 musl (Alpine Linux)
is_musl() {
  if [ "$OS" = "linux" ]; then
    if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -q musl); then
      return 0
    fi
  fi
  return 1
}

# 检测 AVX2 (用于选择 baseline 版本)
has_avx2() {
  case "$OS" in
    linux)
      grep -qwi avx2 /proc/cpuinfo
      ;;
    darwin)
      sysctl -n hw.optional.avx2_0 2>/dev/null | grep -q 1
      ;;
    windows)
      powershell -NoProfile -Command "IsProcessorFeaturePresent(40)" 2>/dev/null | grep -q True
      ;;
  esac
}

# 构建 target 字符串
TARGET="${OS}-${ARCH}"
if is_musl; then
  TARGET="${TARGET}-musl"
elif [ "$ARCH" = "x64" ] && ! has_avx2; then
  TARGET="${TARGET}-baseline"
fi

# 确定归档格式
if [ "$OS" = "linux" ]; then
  ARCHIVE_EXT=".tar.gz"
  ARCHIVE_TYPE="tar"
else
  ARCHIVE_EXT=".zip"
  ARCHIVE_TYPE="zip"
fi

FILENAME="${APP}-${TARGET}${ARCHIVE_EXT}"

# 获取最新版本
get_latest_version() {
  curl -sfL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | \
    sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1
}

# 验证版本存在
version_exists() {
  local ver="$1"
  curl -sfI "https://github.com/${GITHUB_REPO}/releases/tag/v${ver}" > /dev/null 2>&1
}

# 确定要安装的版本
if [ -n "$VERSION" ]; then
  REQUESTED_VERSION="$VERSION"
  if ! version_exists "$VERSION"; then
    echo "错误: 版本 $VERSION 不存在" >&2
    exit 1
  fi
else
  echo "正在获取最新版本..."
  REQUESTED_VERSION=$(get_latest_version)
  if [ -z "$REQUESTED_VERSION" ]; then
    echo "错误: 无法获取最新版本" >&2
    exit 1
  fi
fi

# 构建下载 URL
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${REQUESTED_VERSION}/${FILENAME}"

# 如果没有预编译的 musl/baseline 版本，尝试 fallback
check_and_fallback() {
  local url="$1"
  if ! curl -sfI "$url" > /dev/null 2>&1; then
    # 尝试不带 musl/baseline 的版本
    local basic_filename="${APP}-${OS}-${ARCH}${ARCHIVE_EXT}"
    local fallback_url="https://github.com/${GITHUB_REPO}/releases/download/v${REQUESTED_VERSION}/${basic_filename}"
    if curl -sfI "$fallback_url" > /dev/null 2>&1; then
      echo "$fallback_url"
    else
      return 1
    fi
  else
    echo "$url"
  fi
}

echo "正在安装 ${APP} v${REQUESTED_VERSION} (${TARGET})..."

# 创建安装目录
mkdir -p "$INSTALL_DIR"

# 下载并解压
if [ -n "$BINARY_PATH" ]; then
  # 本地二进制
  echo "使用本地二进制: $BINARY_PATH"
  cp "$BINARY_PATH" "${INSTALL_DIR}/${APP}"
  chmod +x "${INSTALL_DIR}/${APP}"
else
  # 下载
  echo "下载: $DOWNLOAD_URL"
  ARCHIVE_PATH=$(mktemp)
  
  if ! curl -fSL "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"; then
    DOWNLOAD_URL=$(check_and_fallback "$DOWNLOAD_URL")
    if [ -z "$DOWNLOAD_URL" ]; then
      echo "错误: 无法下载 ${APP} v${REQUESTED_VERSION} 的 ${TARGET} 版本" >&2
      rm -f "$ARCHIVE_PATH"
      exit 1
    fi
    echo "重试下载: $DOWNLOAD_URL"
    curl -fSL "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"
  fi
  
  # 解压
  case "$ARCHIVE_TYPE" in
    tar)
      tar -xzf "$ARCHIVE_PATH" -C "$INSTALL_DIR"
      ;;
    zip)
      unzip -o "$ARCHIVE_PATH" -d "$INSTALL_DIR"
      ;;
  esac
  
  rm -f "$ARCHIVE_PATH"
  
  # 确保二进制可执行
  chmod +x "${INSTALL_DIR}/${APP}"
fi

# 添加到 PATH
if [ "$MODIFY_PATH" = true ]; then
  SHELL_NAME=$(basename "$SHELL")
  case "$SHELL_NAME" in
    bash)
      PROFILE="${HOME}/.bashrc"
      ;;
    zsh)
      PROFILE="${HOME}/.zshrc"
      ;;
    fish)
      PROFILE="${HOME}/.config/fish/config.fish"
      ;;
    *)
      PROFILE="${HOME}/.profile"
      ;;
  esac
  
  PATH_LINE="export PATH=\"\${HOME}/.opencode/bin:\${PATH}\""
  
  if ! grep -qF "${INSTALL_DIR}" "$PROFILE" 2>/dev/null; then
    echo "" >> "$PROFILE"
    echo "# Added by ${APP} installer" >> "$PROFILE"
    echo "$PATH_LINE" >> "$PROFILE"
    echo "已将 ${INSTALL_DIR} 添加到 PATH" >&2
  fi
fi

echo ""
echo "${APP} v${REQUESTED_VERSION} 安装成功!"
echo "运行 '${APP}' 开始使用"
