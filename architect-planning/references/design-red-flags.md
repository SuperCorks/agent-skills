# Design red flags

Screen the primary design and each alternative before choosing. A red flag is a reason to revise or reject the shape, not a style note.

Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Prefer the design in which a change that looks right from one file is right for the whole repository.

- **Shallow module.** A large public surface hides little behavior: callers chain several calls to finish one operation, options expose internal stages or implementation choices, or learning the interface does not spare the caller from learning the implementation. Prefer a small interface over substantial behavior. Don't confuse a deep module with a deep call chain: the chain spreads understanding across layers, while the module concentrates capability behind one interface.
- **Information leakage.** Several modules know the same internal decision (a representation, policy, or protocol detail), so changing it needs coordinated edits. Re-exported wire or transport types count. Parse external data into domain types at the boundary and keep storage schemas, framework objects, and protocol details private.
- **Temporal decomposition.** Modules split by execution order (load, validate, transform, save) each restate the same representation and rules. Group code by the knowledge it owns; code that runs at different times can share a module when it protects the same decisions.
- **Pass-through method.** A layer forwards the same arguments to a same-shaped call and hides nothing. Remove it or move the responsibility to the module that can complete the operation. Keep a forwarding boundary only when it adds policy, adaptation, or a distinct abstraction.
- **Split ownership.** Several modules write the same state or keep their own copies. An agent editing one writer cannot see the others, so their rules drift. Give each piece of state one owner; others read it or ask the owner to change it.
- **Two ways to do one task.** An agent copies whichever way it finds first, so every way keeps gaining callers. Keep one, move the callers, and delete the others in the same change.
- **Importable internals.** An agent imports internals when that is the shortest path that compiles, and they become part of the interface. Make them unreachable from outside the module so such an import fails the build.
- **Hand-synced list.** The same items are listed in several places, so adding one means editing every list, and an agent updates only the list it sees. Derive the others from one source, or fail the build when the lists disagree.

Adapted from cursor/plugins pstack (MIT, © 2026 Lauren Tan)
