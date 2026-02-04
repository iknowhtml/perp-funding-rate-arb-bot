#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Funding Rate Arbitrage Bot - Setup                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Helper Functions
# =============================================================================

check_macos() {
  if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script is designed for macOS${NC}"
    echo -e "${YELLOW}For Linux, please install dependencies manually:${NC}"
    echo -e "  - fnm: curl -fsSL https://fnm.vercel.app/install | bash"
    echo -e "  - gitleaks: https://github.com/gitleaks/gitleaks#installation"
    exit 1
  fi
}

setup_homebrew() {
  if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Homebrew not found. Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon
    if [[ $(uname -m) == "arm64" ]]; then
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  else
    echo -e "${GREEN}✓ Homebrew is installed${NC}"
  fi
}

setup_fnm() {
  if ! command -v fnm &> /dev/null; then
    echo -e "\n${YELLOW}Installing fnm (Fast Node Manager)...${NC}"
    brew install fnm
    
    # Setup fnm shell integration
    if [[ -n "$ZSH_VERSION" ]]; then
      eval "$(fnm env --use-on-cd --shell zsh)"
    elif [[ -n "$BASH_VERSION" ]]; then
      eval "$(fnm env --use-on-cd --shell bash)"
    fi
  else
    echo -e "${GREEN}✓ fnm is installed${NC}"
    # Ensure fnm is initialized in this shell
    if [[ -n "$ZSH_VERSION" ]]; then
      eval "$(fnm env --use-on-cd --shell zsh)" 2>/dev/null || true
    elif [[ -n "$BASH_VERSION" ]]; then
      eval "$(fnm env --use-on-cd --shell bash)" 2>/dev/null || true
    fi
  fi
}

configure_fnm_shell() {
  local shell_rc=""
  local fnm_init=""
  
  # Determine shell config file
  if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == *"zsh"* ]]; then
    shell_rc="$HOME/.zshrc"
    fnm_init='eval "$(fnm env --use-on-cd)"'
  elif [[ -n "$BASH_VERSION" ]] || [[ "$SHELL" == *"bash"* ]]; then
    shell_rc="$HOME/.bashrc"
    fnm_init='eval "$(fnm env --use-on-cd)"'
  else
    echo -e "${YELLOW}⚠ Unknown shell. Please manually add fnm to your shell profile.${NC}"
    return
  fi
  
  # Check if fnm is already configured
  if grep -q "fnm env" "$shell_rc" 2>/dev/null; then
    echo -e "${GREEN}✓ fnm is already configured in $shell_rc${NC}"
  else
    echo -e "\n${YELLOW}Adding fnm to $shell_rc...${NC}"
    echo "" >> "$shell_rc"
    echo "# fnm (Fast Node Manager)" >> "$shell_rc"
    echo "$fnm_init" >> "$shell_rc"
    echo -e "${GREEN}✓ fnm added to $shell_rc${NC}"
  fi
}

setup_nodejs() {
  echo -e "\n${YELLOW}Installing Node.js 22 via fnm...${NC}"
  fnm install 22
  fnm use 22
  
  # Get the installed version
  INSTALLED_VERSION=$(node --version | tr -d 'v')
  echo -e "${GREEN}✓ Node.js v${INSTALLED_VERSION} installed${NC}"
}

setup_corepack() {
  echo -e "\n${YELLOW}Enabling Corepack...${NC}"
  corepack enable
  echo -e "${GREEN}✓ Corepack enabled${NC}"
}

setup_lefthook() {
  if ! command -v lefthook &> /dev/null; then
    echo -e "\n${YELLOW}Installing Lefthook (Git Hooks)...${NC}"
    brew install lefthook
  else
    echo -e "${GREEN}✓ Lefthook is installed${NC}"
  fi
}

setup_gitleaks() {
  if ! command -v gitleaks &> /dev/null; then
    echo -e "\n${YELLOW}Installing gitleaks (Secret Scanner)...${NC}"
    brew install gitleaks
  else
    echo -e "${GREEN}✓ gitleaks is installed${NC}"
  fi
}

check_docker() {
  echo -e "\n${YELLOW}Checking Docker installation...${NC}"
  
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo -e "${YELLOW}Please install Docker Desktop: https://www.docker.com/products/docker-desktop${NC}"
    exit 1
  fi
  
  # Check for docker-compose (try both old and new syntax)
  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed.${NC}"
    echo -e "${YELLOW}Please install Docker Compose or use Docker Desktop which includes it.${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✓ Docker is installed${NC}"
}

start_postgres() {
  local compose_file="docker-compose.yml"
  
  if [ -f "$compose_file" ]; then
    echo -e "\n${YELLOW}Starting PostgreSQL with Docker Compose...${NC}"
    
    # Use docker compose (new syntax) or docker-compose (old syntax)
    if docker compose version &> /dev/null; then
      docker compose up -d postgres
    else
      docker-compose up -d postgres
    fi
    
    echo -e "${GREEN}✓ PostgreSQL container started${NC}"
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    sleep 5
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
  else
    echo -e "${YELLOW}⚠ $compose_file not found. Skipping PostgreSQL startup.${NC}"
  fi
}

install_dependencies() {
  echo -e "\n${YELLOW}Installing project dependencies...${NC}"
  pnpm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
}

setup_git_hooks() {
  echo -e "\n${YELLOW}Setting up git hooks...${NC}"
  if command -v lefthook &> /dev/null; then
    pnpm lefthook install
    echo -e "${GREEN}✓ Git hooks installed${NC}"
  else
    echo -e "${YELLOW}⚠ Lefthook not found. Git hooks will be set up when lefthook is installed.${NC}"
  fi
}

setup_env_file() {
  local env_file=".env"
  local env_example=".env.example"
  
  echo -e "\n${YELLOW}Checking environment configuration...${NC}"
  
  if [ ! -f "$env_file" ]; then
    if [ -f "$env_example" ]; then
      cp "$env_example" "$env_file"
      echo -e "${YELLOW}⚠ Created $env_file from example - please configure it${NC}"
    else
      echo -e "${YELLOW}⚠ $env_file not found${NC}"
    fi
  else
    echo -e "${GREEN}✓ Environment file exists${NC}"
  fi
}

print_summary() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}✓ Setup complete!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo -e "1. Configure environment: ${GREEN}Edit .env${NC}"
  echo -e "2. Start development:     ${GREEN}pnpm dev${NC}"
  echo ""
  echo -e "${YELLOW}Useful commands:${NC}"
  echo -e "  ${GREEN}pnpm dev${NC}           - Start development server (with watch)"
  echo -e "  ${GREEN}pnpm build${NC}         - Build for production"
  echo -e "  ${GREEN}pnpm start${NC}         - Run production build"
  echo -e "  ${GREEN}pnpm lint${NC}          - Run linting"
  echo -e "  ${GREEN}pnpm lint:fix${NC}      - Fix linting issues"
  echo -e "  ${GREEN}pnpm typecheck${NC}     - Run TypeScript type checking"
  echo -e "  ${GREEN}pnpm test${NC}          - Run tests (watch mode)"
  echo -e "  ${GREEN}pnpm test:run${NC}      - Run tests once"
  echo -e "  ${GREEN}pnpm test:coverage${NC} - Run tests with coverage"
  echo ""
  echo -e "${YELLOW}Note:${NC} If fnm was just configured, restart your terminal or run:"
  echo -e "  ${GREEN}source ~/.zshrc${NC}  (or ~/.bashrc)"
  echo ""
}

# =============================================================================
# Main Setup Flow
# =============================================================================

echo -e "${YELLOW}Checking system requirements...${NC}"
check_macos

echo -e "\n${YELLOW}Setting up development tools...${NC}"
setup_homebrew
setup_fnm
configure_fnm_shell
setup_nodejs
setup_corepack
setup_lefthook
setup_gitleaks
check_docker

echo -e "\n${YELLOW}Setting up project...${NC}"
install_dependencies
setup_git_hooks
setup_env_file
start_postgres

print_summary
