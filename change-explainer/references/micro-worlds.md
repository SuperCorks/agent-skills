# Micro-worlds

A micro-world is a small, interactive model that lets the reader manipulate or step through the central behavior of a change. It is a teaching instrument, not a miniature rewrite of the product.

## Decision test

Create a micro-world only when every answer below is yes:

1. Is the hard part of the change dynamic, stateful, temporal, spatial, or transformational rather than merely textual?
2. Would changing an input, advancing a step, or comparing states reveal something that a static example or diagram would not?
3. Can a small model preserve the relevant invariants without pretending to reproduce the entire system?
4. Can it run entirely inside the self-contained artifact, without network access, production data, privileged APIs, or external dependencies?
5. Is the expected comprehension benefit worth the extra implementation and validation cost?

Good candidates include state machines, parsers, scheduling or retry behavior, coordinate transformations, incremental migrations, async event ordering, cache invalidation, and non-obvious data transformations.

Usually skip micro-worlds for renames, dependency bumps, straightforward CRUD, configuration changes, ordinary styling, mechanical refactors, or changes whose main difficulty is organizational context rather than runtime behavior.

## Construction rules

- Embed the micro-world in the main explanation next to the concept it teaches.
- Start with one representative scenario and a reset control. Add inputs only when each one supports a specific learning goal.
- Display the connection between user actions and system state: inputs, transition or transformation, output, and relevant invariant.
- Provide step, play, reset, or comparison controls as appropriate. Ensure every control works with a keyboard and has a visible label.
- Keep the implementation deterministic unless randomness is itself the concept; when randomness matters, expose the seed.
- Use embedded toy data. Never connect to production or mutate the repository.
- Clearly label the model as a simulation and list any omitted behavior or simplified assumptions.
- Tie model states and transitions back to inspected symbols or code paths.

## Validation

Exercise at least:

- the initial scenario;
- one boundary or failure case;
- reset and repeated use;
- each explanatory invariant the micro-world claims to demonstrate.

If the model diverges from the code or requires caveats larger than the insight it provides, remove it and use a captured trace, before/after example, or static diagram instead.
