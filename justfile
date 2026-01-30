_default:
    @just --list

# install dependencies
install:
    pnpm install

# build the cli
build:
    pnpm build

# run the tui
run:
    pnpm start

# install globally
link:
    pnpm link --global

# full setup: install, build, link globally
setup: install build link

# uninstall global link
unlink:
    pnpm unlink --global youtube-cli
