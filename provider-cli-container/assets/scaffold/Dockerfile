FROM node:24.18.0-bookworm

ARG TARGETARCH
ARG EAS_CLI_VERSION=21.3.0
ARG GCLOUD_CLI_VERSION=576.0.0
ARG GH_CLI_VERSION=2.94.0
ARG GSWITCH_VERSION=1.5.0
ARG POSTHOG_CLI_VERSION=0.8.4
ARG SUPABASE_CLI_VERSION=2.109.0
ARG VERCEL_CLI_VERSION=58.0.0

USER root

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gnupg \
      jq \
      openssh-client \
      sudo \
    && echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node \
    && install -d -m 0755 /etc/apt/keyrings \
    && curl --fail --silent --show-error \
      https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor --output /etc/apt/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends \
      "google-cloud-cli=${GCLOUD_CLI_VERSION}-0" \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
      amd64) \
        supabase_arch="amd64"; \
        supabase_sha256="d96c1ca0ef1f89582f6f001c306547d709644d35fa298c08600323d4eb9fdcf2"; \
        gh_arch="amd64"; \
        gh_sha256="a757f1ba6db18f4de8cbadb244843a5f89bc75b5e7c6fc127d2bd77fbd12ed62" \
        ;; \
      arm64) \
        supabase_arch="arm64"; \
        supabase_sha256="7ea2fadb3a5590f54dafcd245fe56c465a03734028b8a380e27aeedc319531f2"; \
        gh_arch="arm64"; \
        gh_sha256="705a23b70b0f1b7ba4c302fdcef392ce3edaacfa7ce8e85e4d93d72ea800a538" \
        ;; \
      *) \
        echo "Unsupported architecture: ${TARGETARCH}" >&2; \
        exit 1 \
        ;; \
    esac \
    && curl --fail --location --silent --show-error \
      "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${supabase_arch}.tar.gz" \
      --output /tmp/supabase.tar.gz \
    && echo "${supabase_sha256}  /tmp/supabase.tar.gz" \
      | sha256sum --check --strict \
    && tar -xzf /tmp/supabase.tar.gz -C /usr/local/bin supabase supabase-go \
    && rm /tmp/supabase.tar.gz \
    && curl --fail --location --silent --show-error \
      "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/gh_${GH_CLI_VERSION}_linux_${gh_arch}.tar.gz" \
      --output /tmp/gh.tar.gz \
    && echo "${gh_sha256}  /tmp/gh.tar.gz" \
      | sha256sum --check --strict \
    && tar -xzf /tmp/gh.tar.gz --strip-components=2 \
      -C /usr/local/bin "gh_${GH_CLI_VERSION}_linux_${gh_arch}/bin/gh" \
    && rm /tmp/gh.tar.gz

RUN npm install --global \
      "@posthog/cli@${POSTHOG_CLI_VERSION}" \
      "@supercorks/gswitch@${GSWITCH_VERSION}" \
      "eas-cli@${EAS_CLI_VERSION}" \
      "vercel@${VERCEL_CLI_VERSION}" \
    && npm cache clean --force

USER node
