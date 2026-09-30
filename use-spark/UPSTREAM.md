# Upstream source

This skill is vendored. It is the agent skill embedded in the Spark CLI for Spark Desktop by
Readdle, version 1.3.1 (see `metadata.version` in `SKILL.md`), with one local addition between the
`<!-- local-addition:start -->` and `<!-- local-addition:end -->` markers.

To check for a newer version:

1. Compare `spark skill --version` with `metadata.version` in `SKILL.md`. New Spark Desktop
   releases ship an updated skill.
2. Write the new version to a scratch directory with `spark skill --install /tmp/spark-skill`.
3. Replace `SKILL.md` with `/tmp/spark-skill/use-spark/SKILL.md`, then paste back the local
   addition section unchanged, and update the version above.
