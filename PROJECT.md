# Learn Before You Code

## Product

Learn Before You Code is a production-ready, cross-platform Electron desktop IDE. It should feel as polished and capable as a modern AI IDE while enforcing an educational workflow that helps developers understand concepts before AI generates code.

The product exists to prevent users from accepting generated code without understanding it. Its purpose is not simply to generate code. Its purpose is to make better programmers.

Core principle: **Understand first. Generate second.**

## Technology

### Frontend

- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Monaco Editor
- Zustand
- React Query

### Desktop

- Electron
- Electron Builder
- Electron Updater
- Electron Store
- Secure IPC architecture and preload scripts
- Context isolation enabled
- Node integration disabled

### AI

- OpenAI Codex API
- Streaming responses
- Conversation memory
- Tool-calling architecture

### Data and system integration

- SQLite with `better-sqlite3`
- IndexedDB where appropriate
- Local filesystem
- xterm.js terminal
- isomorphic-git
- simple-git

### Distribution

- Windows
- macOS
- Linux

Everything should be production-ready.

## Product experience

The application should feel like a premium desktop IDE:

- Dark theme by default
- Fast, responsive interaction
- Professional typography
- Smooth animations
- Rounded panels and polished shadows
- Native window controls
- Resizable panels and dockable views
- Multiple tabs and split editors
- Command palette
- Keyboard-first workflow

## Main layout

### Left sidebar

- Explorer
- Open Files
- Git
- Search
- Knowledge Profile
- Learning Dashboard
- AI History
- Settings

### Center

- Monaco Editor
- Tabbed editing
- Split editor support
- Syntax highlighting
- Minimap
- IntelliSense
- Multi-cursor editing
- Code folding
- Breadcrumb navigation

### Right sidebar

- AI Tutor

### Bottom panel

- Integrated Terminal
- Problems
- Output
- Debug Console
- Quiz Results

## Workspace features

- Open folders and projects
- Save, rename, delete, and drag files
- Search and replace across a project
- Recently opened projects
- Workspace settings
- Multi-root workspace support

## Core AI workflow

When a user asks for a coding change, the AI must not immediately generate code.

### 1. Analyze the request

Identify the concepts required to understand the requested work. For an authentication request, this might include JWTs, cookies, sessions, password hashing, middleware, authorization, and database models.

### 2. Teach the concepts

Generate concise, focused lessons that cover:

- Purpose
- Mental model
- Common mistakes
- Visual diagrams
- Small examples

### 3. Run an adaptive quiz

Use a changing mix of:

- Multiple choice
- Fill in the blank
- Predict the output
- Debug code
- Write a short snippet
- Explain a concept

Difficulty should adapt to the user's demonstrated understanding.

### 4. Evaluate understanding

Assign a confidence score. If the score meets or exceeds the configurable passing threshold, unlock code generation. Otherwise, continue teaching, explain mistakes, and generate different questions.

### 5. Generate code

Generated code should stream live and support stopping, regeneration, version comparison, diff review, and accept or reject controls.

Every generated function should have expandable explanations. Hovering over variables should explain their purpose, and hovering over algorithms should explain complexity.

Every generated file should explain:

- Purpose
- Dependencies
- Flow
- Potential improvements

## Explain mode

Every AI change must explain:

- What changed
- Why it changed
- How it works
- Alternative implementations
- Potential bugs
- Performance implications
- Security considerations

## Knowledge profile

Track mastery percentages across concepts including:

- JavaScript
- TypeScript
- React
- Node
- Electron
- Express
- Next.js
- SQL
- NoSQL
- Authentication
- Algorithms
- Data structures
- Networking
- Concurrency
- Testing
- Git
- Docker
- System design
- Electron APIs
- IPC
- Filesystems
- Security
- Memory management

## Learning engine

Maintain a persistent knowledge graph with prerequisite relationships. Detect weak prerequisites automatically and teach them before advanced concepts. Learning should become more personalized over time.

## Memory

Persist locally and load quickly:

- Mistakes
- Quiz history
- Projects
- Preferred teaching style
- Strong concepts
- Weak concepts
- Review schedule
- Frequently forgotten topics
- User goals

## Learning dashboard

The dashboard should include:

- Weekly coding hours
- Concept mastery heatmap
- Learning streak
- XP
- Achievements
- Interview readiness
- Projects completed
- AI interactions
- Quiz accuracy
- Skill progression
- Upcoming reviews
- Recent improvements
- Estimated growth curve

## Gamification

- XP and levels
- Achievements
- Boss quizzes
- Daily and weekly streaks
- Concept mastery badges
- Challenge mode
- Perfect-score rewards
- Learning milestones

## Challenge mode

After every generated solution, offer the user a chance to write it themselves. Generate an empty scaffold, compare their work with the AI solution, highlight differences, and provide coaching.

## Reverse engineering mode

When code is pasted, explain the following before allowing edits:

- Architecture
- Control flow
- Patterns
- Execution order
- Dependencies
- Complexity
- Potential bugs
- Security concerns

## AI chat

Provide persistent, context-aware conversation that understands the current project and can reference:

- Open files
- Selected code
- Errors
- Git changes
- Terminal output
- Project structure

## Git integration

- Commit history
- File staging
- Discard changes
- Branch switching
- Diff viewer
- AI-generated commit messages
- Commit explanations
- Pull request summaries

## Terminal

Provide a fully functional xterm.js terminal with streaming output and clickable errors. It should support installed tools such as npm, pnpm, Bun, Git, Python, and Node.

## File awareness

The AI should understand the project tree, imports, dependencies, configuration, open editors, recent edits, and referenced files without requiring manual copy and paste.

## Inline AI

When code is selected, offer contextual actions:

- Explain
- Refactor
- Optimize
- Document
- Generate tests
- Find bugs
- Improve naming
- Convert language
- Teach this code

## Code generation controls

Code generation unlocks only after the user passes the relevant quiz. Generated changes should support:

- Live streaming
- Stop generation
- Regenerate
- Compare versions
- Accept or reject
- Diff review

## Accessibility

- Keyboard-first operation
- Screen reader support
- High contrast mode
- Reduced motion
- Configurable font size
- Accessible command palette

## Security

- Follow Electron security best practices
- Enable context isolation
- Disable Node integration in renderers
- Enforce a strict Content Security Policy
- Expose only a narrow, safe IPC bridge
- Validate all IPC and external input
- Encrypt local secrets
- Prevent untrusted arbitrary code execution through application boundaries
- Use secure auto-updates

## Performance and resilience

- Fast startup
- Lazy loading
- Streaming UI
- Efficient rendering
- Virtualized lists
- Background indexing
- Large-project support
- Low memory usage
- Autosave
- Crash recovery

## Settings

Allow users to configure:

- Quiz difficulty
- Lesson verbosity
- Teaching style
- Passing score
- Theme
- Font
- Animations
- AI personality
- Offline mode
- Keyboard shortcuts
- Editor preferences
- Autosave
- Telemetry

## Extensibility

Use a modular plugin architecture so future capabilities can be added without major refactoring. Potential future modules include:

- Voice tutoring
- Live pair programming
- LeetCode practice
- Interview simulator
- GitHub integration
- Code review assistant
- Cloud sync
- Marketplace
- Extension API
- Collaborative editing
- MCP server integration
- Custom AI providers

## Engineering standards

- Separate renderer, main, preload, and supporting service responsibilities
- Maintain strict IPC boundaries
- Use strong typing and consistent naming
- Prefer simple, maintainable architecture
- Use reusable components where reuse is real
- Include error boundaries, logging, and testing support
- Keep the folder structure clear and intentional
- Do not ship placeholder implementations, TODOs, mock features, or fake APIs
- Build functional features suitable for real-world use

The finished application should combine the productivity of a modern AI IDE with the educational depth of a personal programming tutor. Every interaction should reinforce the principle: **Understand first. Generate second.**
