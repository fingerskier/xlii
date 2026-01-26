# xlii
## an agent memory manager

Manages AI memory files (CLAUDE.md, AGENTS.md, et cetera) which fall outside of git repos.

* Creates a mirror image of your "base" directories structures down to the first git repo in each branch.
* "Complete" directories have their entire contents mirrored.
* Allows you to store memory files outside of git repositories in a central git repo...

Memory files that get stored:
* CLAUDE.md
* AGENTS.md
* TODO.md
* SPEC.md

...only files outside of git repos are stored...


## Functionality

`npx xlii configure myPC ~/dev`
* creates the local configuration file `~/.xlii/config.json` with this system's name and base directory for storing memory files.
```json
{
  "systemName": "myPC",
  "baseDirectories": ["~/dev"],
  "completeDirectories": ["~/.claude/skills"],
  "storagePath": "~/xlii/myPC"
}
```
* if you clone the agent-memory on another machine you would give it a different system name, which gets stored in a separate directory in the "storagePath".
* mirrors each of the base directories into `~/xlii/myPC/`
  * recursively traverses each base directory, stopping when it reaches a directory containing a git repo on any branch
  * only directories and the memory files are stored in the mirror image
* paths are expanded in the storage path for clarity: e.g. `~/dev` becomes `./myPC/home/me/dev` in the storage path

* create `~/xlii/configuration.json` file
```json
{
  "memoryFiles": ["CLAUDE.md", "AGENTS.md", "TODO.md", "SPEC.md"]
}
```

An example directory structure:
```
~/xlii
├── myPC
│   ├── /home/me/dev
│   │   ├── CLAUDE.md
│   │   ├── AGENTS.md
│   │   ├── projectA
│   │   └── projectB
│   └── /home/me/.claude/skills
│       ├── skill1
│       │   ├── SKILL.md
│       └── skill2
│           └── SKILL.md
└── otherPC
    ├── /home/me/dev  -- this is a base directory so only memory files are synced
    │   ├── CLAUDE.md
    │   ├── AGENTS.md
    │   ├── projectA
    │   └── projectB
    └── /home/me/.claude/skills  -- this is a complete directory so all files are synced
        ├── skill1
        │   ├── SKILL.md
        └── skill2
            └── SKILL.md
```

**The `storagePath` directory is intended to be a git repo to track memory files.**


## Usage

**First** run `npx xlii configure myPC ~/dev /memory`
* sets update the `~/dev` as the base directory
* set `/memory` as the storage path

**Then** use the following commands to manage your memory files:

`npx xlii harvest` ~ copies memory files from the base directories into the storagePath mirror image regardless of which is newer.  If new memory files are found in the base directories they are added to the mirror image.

`npx xlii sow` ~ copies memory files from the storagePath mirror image back into the base directories regardless of which is newer.  If new memory files are found in the mirror image they are added to the base directories.

`npx xlii graft` ~ syncs storage and base directories by taking whichever memory files are newer.
* identical timestamps are considered "no change".
* if a memory file exists in only one location it is copied to the other location.

`npx xlii diff` ~ lists differences between memory files in the base directories and the storagePath mirror image.

`npx xlii addBaseDir ~/otherDev` ~ adds another base directory to the configuration and updates the mirror image.

`npx xlii addCompleteDir ~/.claude/skills` ~ adds a "complete" directory to the configuration and updates the mirror image.

`npx xlii addmemoryFile STUFF.md` ~ adds another memory file to be tracked.

`npx xlii watch` ~ watches the base directories for changes to memory files and automatically syncs them to the storagePath mirror image when they change if they are newer than what's in the storage-path.

`npx xlii openconfig` ~ opens the xlii config file in the default editor.