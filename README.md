# agent-memory-manager

Manages AI memory files (like CLAUDE.md's) which fall outside of git repos.

The tool creates a mirror image of your target directories (just the dirs), recusrively, down the leaf-most non-git directories.
The base directory structure is one directory per system: `windows`, `linux-laptop`, `macbook`...
Amy CLAUDE.md, AGENTS.md, etc are copied back/forth to that central directory- which could be another git repo.
It would nominally include the global settings in a `.claude`, or similar, directory.
