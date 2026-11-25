# Upstream source

This skill is vendored from the Spark CLI for Spark Desktop by Readdle, version 1.4.3.
The local Spark-link guidance appears in the front-matter description and the
`Opening Spark links` section between the local-addition markers.

To refresh the skill:

1. Compare `spark skill --version` with `metadata.version` in `SKILL.md`.
2. Export the new version to a scratch directory with `spark skill --install /tmp/spark-skill`.
3. Copy the exported `use-spark/SKILL.md` into this directory and restore the local
   link description, marked section, and refresh instructions from the previous file.
4. Update the version in this note.
