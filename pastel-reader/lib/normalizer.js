function buildMetadata(operation, details = {}) {
  return {
    source: 'pastel',
    operation,
    fetchedAt: new Date().toISOString(),
    ...details,
  };
}

function normalizeCanvas(canvas) {
  return {
    id: canvas.id,
    name: canvas.name || canvas.title || null,
    title: canvas.title || canvas.name || null,
    type: canvas.type,
    subdomain: canvas.subdomain,
    localUrl: canvas.localUrl || null,
    url: canvas.url || canvas.projectUrl || canvas.initialUrl || null,
    initialPath: canvas.initialPath || null,
    visibility: canvas.visibility || null,
    UserId: canvas.UserId || canvas.userId || null,
    FolderId: canvas.FolderId || canvas.folderId || null,
    createdAt: canvas.createdAt || null,
    updatedAt: canvas.updatedAt || null,
    archiveDate: canvas.archiveDate || null,
    readOnlyDate: canvas.readOnlyDate || null,
    canvasAssetsCount: Array.isArray(canvas.CanvasAssets) ? canvas.CanvasAssets.length : undefined,
  };
}

function normalizeComment(annotation) {
  const replies = asArray(annotation.AnnotationReplies).map(normalizeReply);
  const attachments = asArray(annotation.FileAttachments).map(normalizeAttachment);
  const labels = asArray(annotation.Labels).map(normalizeLabel);
  const reactions = asArray(annotation.AnnotationReactions).map(normalizeReaction);

  return {
    id: annotation.id,
    number: annotation.number ?? null,
    CanvasId: annotation.CanvasId || annotation.canvasId || null,
    CanvasAssetId: annotation.CanvasAssetId || annotation.canvasAssetId || null,
    CanvasRevisionId: annotation.CanvasRevisionId || annotation.revisionId || null,
    UserId: annotation.UserId || annotation.userId || null,
    userName: annotation.userName || annotation.User?.name || null,
    userEmail: annotation.User?.email || null,
    comment: annotation.comment || '',
    status: annotation.status || null,
    isPrivate: Boolean(annotation.isPrivate),
    assignedUserId: annotation.assignedUserId || null,
    labels,
    replies,
    reactions,
    fileAttachments: attachments,
    numFileAttachments: annotation.numFileAttachments ?? attachments.length,
    screenshotUrl: annotation.screenshotUrl || null,
    afterScreenshotUrl: annotation.afterScreenshotUrl || null,
    fullCommentUrl: annotation.fullCommentUrl || null,
    targetSelector: annotation.targetSelector || null,
    targetOffsetX: annotation.targetOffsetX ?? null,
    targetOffsetY: annotation.targetOffsetY ?? null,
    path: annotation.path || annotation.metadata?.path || null,
    pageUrl: annotation.fullUrl || annotation.url || annotation.metadata?.url || null,
    metadata: annotation.metadata || null,
    textContentBefore: annotation.textContentBefore || null,
    textContentAfter: annotation.textContentAfter || null,
    lastExportDate: annotation.lastExportDate || null,
    createdAt: annotation.createdAt || null,
    updatedAt: annotation.updatedAt || null,
  };
}

function normalizeReply(reply) {
  return {
    id: reply.id,
    AnnotationId: reply.AnnotationId || reply.annotationId || null,
    UserId: reply.UserId || reply.userId || null,
    userName: reply.userName || reply.User?.name || null,
    userEmail: reply.User?.email || null,
    comment: reply.comment || '',
    isPrivate: Boolean(reply.isPrivate),
    fileAttachments: asArray(reply.FileAttachments).map(normalizeAttachment),
    reactions: asArray(reply.AnnotationReactions).map(normalizeReaction),
    createdAt: reply.createdAt || null,
    updatedAt: reply.updatedAt || null,
  };
}

function normalizeAttachment(file) {
  return {
    id: file.id,
    name: file.name || file.filename || null,
    url: file.url || file.href || null,
    type: file.type || file.mimeType || null,
    size: file.size || file.fileSize || null,
  };
}

function normalizeLabel(label) {
  if (typeof label === 'string') {
    return { id: label, name: null, color: null };
  }
  return {
    id: label.id,
    name: label.name || null,
    color: label.color || label.colour || null,
  };
}

function normalizeReaction(reaction) {
  return {
    id: reaction.id,
    emoji: reaction.emoji || reaction.name || null,
    UserId: reaction.UserId || reaction.userId || null,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractArray(body, preferredKeys = []) {
  if (Array.isArray(body)) {
    return body;
  }
  if (!body || typeof body !== 'object') {
    return [];
  }
  for (const key of preferredKeys) {
    if (Array.isArray(body[key])) {
      return body[key];
    }
  }
  if (Array.isArray(body.data)) {
    return body.data;
  }
  if (Array.isArray(body.results)) {
    return body.results;
  }
  return [];
}

function getCommentTimestamp(comment) {
  const value = comment.createdAt || comment.updatedAt || comment.lastExportDate;
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  buildMetadata,
  normalizeCanvas,
  normalizeComment,
  extractArray,
  getCommentTimestamp,
};
